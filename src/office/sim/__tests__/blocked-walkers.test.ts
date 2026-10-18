import { describe, expect, it, vi } from 'vitest'
import {
  bodyFits,
  PLAYER_BODY_RADIUS,
  WORKER_BODY_RADIUS,
  type BodyFootprint
} from '../../../shared/office/body-footprints'
import type { AgentView, SessionRef } from '../../../shared/office/types'
import { LOUNGE_DELAY_MS } from '../behaviour'
import { deskOf } from '../layout'
import { floorElevation } from '../world-floor-routes'
import { CityWorld, observed } from './city-harness'
import { TICK_MS } from './door-invariants'

// Full sim runs: the 5 s default times out under load (health-9).
vi.setConfig({ testTimeout: 60_000 })

const GAMER = 'claude:idle'
// Past the lounge delay and the walk to the corner.
const SETTLE_MS = LOUNGE_DELAY_MS + 30_000
const MAX_STEP_METRES = 0.140001
// Measured 25.1 s: it shuffles along the crate while each try gains it 5 cm, then stalls.
const CALLED_HOME_WITHIN_MS = 27_000
// Measured 14.0 s: a 12 s stall and two retries a second apart, then the fade.
const SET_OUT_WITHIN_MS = 16_000
// live-feed's longest step: the sim runs ten ticks in it, more than a whole fade.
const STALLED_STEP_MS = 1000

const working = (nowMs: number): SessionRef => ({
  ...observed(GAMER, 'p_a', nowMs),
  activity: 'thinking'
})

// One idle agent on its project's floor, and a crate it can never pass in its office door.
function gamerWorld() {
  const city = new CityWorld((nowMs) => [observed(GAMER, 'p_a', nowMs)])
  const view = city.world.step(0).find((candidate) => candidate.agentKey === GAMER)!
  const home = deskOf(city.world.layout().floors, view)!
  const { door } = home.floor.rooms.find((room) => room.id === view.roomId)!
  const crate: BodyFootprint = {
    id: 'crate',
    x: door.x,
    z: door.z,
    elevation: floorElevation(home.floor),
    radius: PLAYER_BODY_RADIUS
  }
  const desk = { id: GAMER, x: home.desk.x, z: home.desk.z, radius: WORKER_BODY_RADIUS }
  return { city, crate, deskIsClear: bodyFits({ ...desk, elevation: crate.elevation }, [crate]) }
}

// Follows the gamer: when it is first seated, its largest visible step, and any move while faded.
function follow(city: CityWorld, ms: number, isDone: (view: AgentView) => boolean) {
  let previous: AgentView | undefined
  let largestStep = 0
  let movedWhileFaded = 0
  let doneAtMs: number | null = null
  city.run(ms, (frame, elapsedMs) => {
    const view = frame.find((candidate) => candidate.agentKey === GAMER)!
    if (previous) {
      const step = Math.hypot(view.x - previous.x, view.z - previous.z)
      if (previous.fade === undefined) largestStep = Math.max(largestStep, step)
      else if (view.fade !== undefined) movedWhileFaded = Math.max(movedWhileFaded, step)
    }
    previous = view
    if (isDone(view)) doneAtMs = elapsedMs
    return doneAtMs !== null
  })
  return { doneAtMs, largestStep, movedWhileFaded }
}

describe('a walker blocked for good fades home instead of standing forever', () => {
  it('seats a gamer called home through a blocked office door at its desk', () => {
    const { city, crate, deskIsClear } = gamerWorld()
    expect(deskIsClear).toBe(true)
    city.run(SETTLE_MS, () => {})
    expect(city.world.step(0).find((view) => view.agentKey === GAMER)?.place).toBe('lounge')
    city.world.setBodyObstacles([crate])
    city.patch([working(city.clock)])
    const followed = follow(city, 60_000, (view) => city.isSeated(view))
    expect({
      isSeated: followed.doneAtMs !== null,
      isWalking: followed.largestStep <= MAX_STEP_METRES,
      movedWhileFaded: followed.movedWhileFaded
    }).toEqual({ isSeated: true, isWalking: true, movedWhileFaded: 0 })
    expect(followed.doneAtMs).toBeLessThanOrEqual(CALLED_HOME_WITHIN_MS)
  })

  // A stalled frame can run the stall, the fade and the seat in one step; the count still shows it.
  it('counts the reseat of a walker whose whole fade home fits in one step', () => {
    const calledHome = () => {
      const { city, crate } = gamerWorld()
      city.run(SETTLE_MS, () => {})
      city.world.setBodyObstacles([crate])
      city.patch([working(city.clock)])
      return city
    }
    let fadeAtMs = 0
    calledHome().run(60_000, (frame, elapsedMs) => {
      if (frame.find((view) => view.agentKey === GAMER)?.fade === undefined) return false
      fadeAtMs = elapsedMs
      return true
    })
    expect(fadeAtMs).toBeGreaterThan(0)
    const city = calledHome()
    city.run(fadeAtMs - TICK_MS, () => {})
    const stalled = city.world.step(0).find((view) => view.agentKey === GAMER)!
    const desk = deskOf(city.world.layout().floors, stalled)!.desk
    expect(stalled.fade).toBeUndefined()
    expect(Math.hypot(stalled.x - desk.x, stalled.z - desk.z)).toBeGreaterThan(WORKER_BODY_RADIUS)
    city.clock += STALLED_STEP_MS
    const seated = city.world.step(STALLED_STEP_MS).find((view) => view.agentKey === GAMER)

    expect({ isSeated: city.isSeated(seated), fade: seated?.fade }).toEqual({
      isSeated: true,
      fade: undefined
    })
    expect(seated?.reseats).toBe((stalled.reseats ?? 0) + 1)
  })

  // Back at its desk it waits the lounge delay again, rather than walk straight back out.
  it('brings a gamer that cannot get out to the corner back to its desk', () => {
    const { city, crate, deskIsClear } = gamerWorld()
    expect(deskIsClear).toBe(true)
    city.world.setBodyObstacles([crate])
    const setOut = follow(city, SETTLE_MS, (view) => view.place === 'lounge')
    expect(setOut.doneAtMs).not.toBeNull()
    const back = follow(city, 60_000, (view) => city.isSeated(view))
    expect({ isSeated: back.doneAtMs !== null, movedWhileFaded: back.movedWhileFaded }).toEqual({
      isSeated: true,
      movedWhileFaded: 0
    })
    expect(back.doneAtMs).toBeLessThanOrEqual(SET_OUT_WITHIN_MS)
    const stays = follow(city, LOUNGE_DELAY_MS - 1_000, (view) => !city.isSeated(view))
    expect(stays.doneAtMs).toBeNull()
  })
})
