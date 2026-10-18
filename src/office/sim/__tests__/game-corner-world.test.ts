import { describe, expect, it, vi } from 'vitest'
import type { AgentView, SessionRef } from '../../../shared/office/types'
import { footprintEdges } from '../../../shared/office/world-document-geometry'
import type { WorldDocument } from '../../../shared/office/world-document-types'
import { LOUNGE_DELAY_MS } from '../behaviour'
import type { FloorLayout, LoungeLayout } from '../layout'
import { LOUNGE_WIDTH } from '../rooms'
import { NAV_CELL_METRES, ROUTE_MARGIN_METRES } from '../navigation'
import { WORKER_BODY_RADIUS } from '../../../shared/office/body-footprints'
import { CityWorld, observed } from './city-harness'

// Full sim runs: the 5 s default times out under load (health-9).
vi.setConfig({ testTimeout: 120_000 })

// Past the lounge delay and a walk across any generated floor.
const SETTLE_MS = LOUNGE_DELAY_MS + 30_000
// Eight gamers setting off at once: the last sat after 37.7 s north of the offices, 38.9 s
// west, 40.6 s east and 44.9 s south.
const FULL_CORNER_MS = LOUNGE_DELAY_MS + 50_000
// Recalling that corner, the last sat after 30.2 s; the longest stand, 6.4 s, is a passage
// yield, which lasts 8 s at most.
const RECALL_MS = 35_000
const LONGEST_STAND_MS = 8_000
// The front row's distance from the screen, less half a grid cell for the walk along it.
const SCREEN_STRIP_METRES = 1.2 - NAV_CELL_METRES / 2
// Ruling: behind the screen, a gamer keeps a body's clearance; open floor beyond is a walkway.
const BEHIND_SCREEN_METRES = WORKER_BODY_RADIUS + ROUTE_MARGIN_METRES

// How far a point stands in from the corner's screen edge, and how far off its centre line.
function screenSide(corner: LoungeLayout, point: { x: number; z: number }) {
  const facing = { x: Math.sin(corner.slots[0].heading), z: Math.cos(corner.slots[0].heading) }
  const isAcrossX = Math.abs(facing.x) > 0.5
  const half = (isAcrossX ? corner.width : corner.depth) / 2
  const far = { x: corner.x + facing.x * half, z: corner.z + facing.z * half }
  return {
    toScreen: (far.x - point.x) * facing.x + (far.z - point.z) * facing.z,
    isAlongScreen:
      Math.abs((point.x - corner.x) * -facing.z + (point.z - corner.z) * facing.x) <=
      (isAcrossX ? corner.depth : corner.width) / 2
  }
}

// Which side of its offices a corner stands on.
function sideOf(floor: FloorLayout, corner: LoungeLayout): string {
  const { west, east, north, south } = footprintEdges(floor.rooms)
  if (corner.x - corner.width / 2 >= east) return 'east'
  if (corner.x + corner.width / 2 <= west) return 'west'
  if (corner.z + corner.depth / 2 <= north) return 'north'
  return corner.z - corner.depth / 2 >= south ? 'south' : 'among the offices'
}

// The generated nine-office building, grown and its offices moved so one side has room.
const regrown =
  (grow: { x: number; z: number }, shift: { x: number; z: number }) =>
  ({ buildings: [building], rooms }: WorldDocument) => {
    building.footprint.width += grow.x
    building.footprint.depth += grow.z
    const { width, depth } = building.footprint
    building.entrance = { x: 0, z: -depth / 2 }
    building.connector = { x: -width / 2 + 2, z: -depth / 2 + 2, width: 2, depth: 2 }
    for (const room of rooms)
      room.position = { x: room.position.x + shift.x, z: room.position.z + shift.z }
  }
const ORIENTATIONS = [
  { name: 'generated, east and sideways', reshape: () => {}, heading: Math.PI, side: 'east' },
  {
    name: 'north, facing away',
    reshape: regrown({ x: 0, z: 10 }, { x: 0, z: 5 }),
    heading: Math.PI,
    side: 'north'
  },
  {
    name: 'west, facing away',
    reshape: regrown({ x: 8, z: 0 }, { x: 4, z: 0 }),
    heading: -Math.PI / 2,
    side: 'west'
  },
  {
    name: 'south and sideways',
    reshape: regrown({ x: -LOUNGE_WIDTH, z: 8 }, { x: LOUNGE_WIDTH / 2, z: -4 }),
    heading: -Math.PI / 2,
    side: 'south'
  }
]

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

  it.each(ORIENTATIONS)(
    'keeps the ninth idle agent at its desk once all eight seats are taken: $name',
    ({ reshape, heading, side }) => {
      const idle = Array.from({ length: 9 }, (_, index) => `claude:idle-${index}`)
      const city = new CityWorld((nowMs) => idle.map((key) => observed(key, 'p_a', nowMs)), reshape)
      const floor = city.world.layout().floors.find((candidate) => candidate.rooms.length)!
      const corner = floor.zones[0].lounge!
      expect({ heading: corner.slots[0].heading, side: sideOf(floor, corner) }).toEqual({
        heading,
        side
      })
      let views: AgentView[] = []
      // Nobody walking to a seat cuts through the strip before the screen, or brushes its back.
      let closestToScreen = Infinity
      city.run(FULL_CORNER_MS, (frame) => {
        views = frame
        for (const view of frame) {
          if (view.place !== 'lounge') continue
          if (corner.slots.some((seat) => seat.x === view.x && seat.z === view.z)) continue
          const { toScreen, isAlongScreen } = screenSide(corner, view)
          if (isAlongScreen && toScreen > -BEHIND_SCREEN_METRES)
            closestToScreen = Math.min(closestToScreen, toScreen)
        }
      })
      expect(closestToScreen).toBeGreaterThanOrEqual(SCREEN_STRIP_METRES)
      const gamers = views.filter((view) =>
        corner.slots.some(
          (seat) => view.place === 'lounge' && seat.x === view.x && seat.z === view.z
        )
      )
      const atDesks = views.filter((view) => city.isSeated(view))
      expect({ gamers: gamers.length, atDesks: atDesks.length }).toEqual({ gamers: 8, atDesks: 1 })
    }
  )

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

  // The renderer eases a shrinking robot toward its view, so a mid-fade move is a glide.
  it('holds a flapped gamer where it faded until the fade ends, then seats it at its desk', () => {
    const { city, idle } = threeBuildings()
    city.patch([], ['claude:idle'])
    city.run(200, () => {})
    city.patch([working('claude:idle', 'p_b', city.clock)])
    let movedWhileFaded = 0
    let isSeated = false
    city.run(5_000, (frame) => {
      const view = frame.find((candidate) => candidate.agentKey === 'claude:idle')!
      if (view.fade === undefined) return (isSeated = city.isSeated(view))
      movedWhileFaded = Math.max(movedWhileFaded, Math.hypot(view.x - idle.x, view.z - idle.z))
    })
    expect({ movedWhileFaded, isSeated }).toEqual({ movedWhileFaded: 0, isSeated: true })
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
