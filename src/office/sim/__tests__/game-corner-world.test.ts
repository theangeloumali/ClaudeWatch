import { describe, expect, it, vi } from 'vitest'
import type { AgentView, SessionRef } from '../../../shared/office/types'
import { LOUNGE_DELAY_MS } from '../behaviour'
import { CityWorld, observed } from './city-harness'

// Full sim runs: the 5 s default times out under load (health-9).
vi.setConfig({ testTimeout: 120_000 })

// Past the lounge delay and a walk across any generated floor.
const SETTLE_MS = LOUNGE_DELAY_MS + 30_000

const working = (key: string, project: string, nowMs: number): SessionRef => ({
  ...observed(key, project, nowMs),
  activity: 'thinking'
})

// One company, three project buildings; only the second project's agent is idle.
function threeBuildings() {
  const city = new CityWorld((nowMs) => [
    working('claude:first', 'p_a', nowMs),
    observed('claude:idle', 'p_b', nowMs),
    working('claude:third', 'p_c', nowMs)
  ])
  let views: AgentView[] = []
  city.run(SETTLE_MS, (frame) => {
    views = frame
  })
  return { city, idle: views.find((view) => view.agentKey === 'claude:idle')! }
}

describe('game corner: idle agents play on their own floor', () => {
  it('gives an idle agent in the second project building a corner seat on its floor', () => {
    const { city, idle } = threeBuildings()
    const floor = city.world.layout().floors.find((candidate) => candidate.id === idle.floorId)!
    const corner = floor.zones[0].lounge
    expect(corner?.id).toBe(`${floor.id}:games`)
    expect({
      place: idle.place,
      physicalFloorId: idle.physicalFloorId,
      isOnASeat: corner?.slots.some((seat) => seat.x === idle.x && seat.z === idle.z)
    }).toEqual({ place: 'lounge', physicalFloorId: floor.id, isOnASeat: true })
  })

  it('keeps the ninth idle agent at its desk once all eight seats are taken', () => {
    const idle = Array.from({ length: 9 }, (_, index) => `claude:idle-${index}`)
    const city = new CityWorld((nowMs) => idle.map((key) => observed(key, 'p_a', nowMs)))
    let views: AgentView[] = []
    city.run(SETTLE_MS, (frame) => {
      views = frame
    })
    const floor = city.world.layout().floors.find((candidate) => candidate.id === views[0].floorId)!
    const seats = floor.zones[0].lounge!.slots
    const gamers = views.filter((view) =>
      seats.some((seat) => view.place === 'lounge' && seat.x === view.x && seat.z === view.z)
    )
    const atDesks = views.filter((view) => city.isSeated(view))
    expect({ seats: seats.length, gamers: gamers.length, atDesks: atDesks.length }).toEqual({
      seats: 8,
      gamers: 8,
      atDesks: 1
    })
  })

  it('walks a gamer back to its desk when work arrives, never fading or leaving the floor', () => {
    const { city, idle } = threeBuildings()
    expect(idle.place).toBe('lounge')
    city.patch([working('claude:idle', 'p_b', city.clock)])
    let previous = idle
    let largestStep = 0
    let seatedAtMs: number | null = null
    const marks = new Set<string>()
    city.run(20_000, (frame, elapsedMs) => {
      const view = frame.find((candidate) => candidate.agentKey === 'claude:idle')!
      largestStep = Math.max(largestStep, Math.hypot(view.x - previous.x, view.z - previous.z))
      if (view.fade !== undefined) marks.add('faded')
      if (view.physicalFloorId !== idle.physicalFloorId) marks.add('left its floor')
      previous = view
      if (city.isSeated(view)) seatedAtMs ??= elapsedMs
      return seatedAtMs !== null
    })
    expect({ marks: [...marks], isWalking: largestStep <= 0.140001 }).toEqual({
      marks: [],
      isWalking: true
    })
    expect(seatedAtMs).not.toBeNull()
  })

  it('keeps every agent at its desk while lounge trips are off', () => {
    const city = new CityWorld((nowMs) => [
      observed('claude:idle-a', 'p_a', nowMs),
      observed('claude:idle-b', 'p_b', nowMs)
    ])
    city.world.setLoungeTrips(false)
    let views: AgentView[] = []
    city.run(SETTLE_MS, (frame) => {
      views = frame
    })
    expect(views.map((view) => [view.agentKey, city.isSeated(view)])).toEqual([
      ['claude:idle-a', true],
      ['claude:idle-b', true]
    ])
  })
})
