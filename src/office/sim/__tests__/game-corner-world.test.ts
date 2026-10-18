import { describe, expect, it, vi } from 'vitest'
import type { AgentView, SessionRef } from '../../../shared/office/types'
import { LOUNGE_DELAY_MS } from '../behaviour'
import type { LoungeLayout } from '../layout'
import { NAV_CELL_METRES } from '../navigation'
import { CityWorld, observed } from './city-harness'

// Full sim runs: the 5 s default times out under load (health-9).
vi.setConfig({ testTimeout: 120_000 })

// Past the lounge delay and a walk across any generated floor.
const SETTLE_MS = LOUNGE_DELAY_MS + 30_000
// Eight gamers setting off at once: the last, held behind a seated row, sat after 37.7 s.
const FULL_CORNER_MS = LOUNGE_DELAY_MS + 45_000
// Recalling that corner, the last sat after 30.2 s; the longest stand, 6.4 s, is a passage
// yield, which lasts 8 s at most.
const RECALL_MS = 35_000
const LONGEST_STAND_MS = 8_000
// The front row's distance from the screen, less half a grid cell for the walk along it.
const SCREEN_STRIP_METRES = 1.2 - NAV_CELL_METRES / 2

// How far a point stands in from the corner's screen edge, and how far off its centre line.
function screenSide(corner: LoungeLayout, point: { x: number; z: number }) {
  const facing = { x: Math.sin(corner.slots[0].heading), z: Math.cos(corner.slots[0].heading) }
  const isAcrossX = Math.abs(facing.x) > 0.5
  const reach = isAcrossX ? corner.width : corner.depth
  const far = { x: corner.door.x + facing.x * reach, z: corner.door.z + facing.z * reach }
  return {
    toScreen: (far.x - point.x) * facing.x + (far.z - point.z) * facing.z,
    isAlongScreen:
      Math.abs((point.x - corner.x) * -facing.z + (point.z - corner.z) * facing.x) <=
      (isAcrossX ? corner.depth : corner.width) / 2
  }
}

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
    // Nobody walking to a seat cuts through the strip before the screen, or behind it.
    let closestToScreen = Infinity
    city.run(FULL_CORNER_MS, (frame) => {
      views = frame
      const corner = city.world.layout().floors.find((floor) => floor.id === frame[0].floorId)
        ?.zones[0].lounge
      if (!corner) return
      for (const view of frame) {
        if (view.place !== 'lounge') continue
        if (corner.slots.some((seat) => seat.x === view.x && seat.z === view.z)) continue
        const { toScreen, isAlongScreen } = screenSide(corner, view)
        if (isAlongScreen) closestToScreen = Math.min(closestToScreen, toScreen)
      }
    })
    expect(closestToScreen).toBeGreaterThanOrEqual(SCREEN_STRIP_METRES)
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

  // A session that ends and comes straight back must not reappear walking from the corner.
  it('brings back a gamer whose session flapped faded in at its desk, never in the open', () => {
    const { city, idle } = threeBuildings()
    expect(idle.place).toBe('lounge')
    city.patch([], ['claude:idle'])
    city.run(200, () => {})
    city.patch([working('claude:idle', 'p_b', city.clock)])
    const shownAway: AgentView[] = []
    let shownAtDesk = false
    city.run(5_000, (frame) => {
      const view = frame.find((candidate) => candidate.agentKey === 'claude:idle')
      if (!view || view.fade !== undefined) return
      if (city.isSeated(view)) shownAtDesk = true
      else shownAway.push(view)
      return true
    })
    expect({ shownAway: shownAway.length, shownAtDesk }).toEqual({
      shownAway: 0,
      shownAtDesk: true
    })
  })

  // Before I1 a gamer stood 12 s against an office wall and the last one sat after 41.9 s.
  it('walks a full corner of gamers home with none standing still for long', () => {
    const idle = Array.from({ length: 9 }, (_, index) => `claude:idle-${index}`)
    const city = new CityWorld((nowMs) => idle.map((key) => observed(key, 'p_a', nowMs)))
    let views: AgentView[] = []
    city.run(FULL_CORNER_MS, (frame) => {
      views = frame
    })
    expect(views.filter((view) => view.place === 'lounge')).toHaveLength(8)
    city.patch(idle.map((key) => working(key, 'p_a', city.clock)))
    const anchors = new Map<string, { x: number; z: number; sinceMs: number }>()
    let longestStandMs = 0
    let seatedAtMs = Infinity
    city.run(RECALL_MS, (frame, elapsedMs) => {
      for (const view of frame) {
        const anchor = anchors.get(view.agentKey)
        if (
          city.isSeated(view) ||
          !anchor ||
          Math.hypot(view.x - anchor.x, view.z - anchor.z) > 0.5
        )
          anchors.set(view.agentKey, { x: view.x, z: view.z, sinceMs: elapsedMs })
        else longestStandMs = Math.max(longestStandMs, elapsedMs - anchor.sinceMs)
      }
      if (frame.every((view) => city.isSeated(view))) seatedAtMs = elapsedMs
      return seatedAtMs < Infinity
    })
    expect(longestStandMs).toBeLessThanOrEqual(LONGEST_STAND_MS)
    expect(seatedAtMs).toBeLessThanOrEqual(RECALL_MS)
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
    // With no corner to go to, staying put would prove nothing about the switch.
    const floors = city.world.layout().floors
    expect(
      views.map((view) => floors.find((floor) => floor.id === view.floorId)?.zones[0].lounge?.id)
    ).toEqual(views.map((view) => `${view.floorId}:games`))
    expect(views.map((view) => [view.agentKey, city.isSeated(view)])).toEqual([
      ['claude:idle-a', true],
      ['claude:idle-b', true]
    ])
  })
})
