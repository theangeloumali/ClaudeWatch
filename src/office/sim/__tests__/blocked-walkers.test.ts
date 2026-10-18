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
