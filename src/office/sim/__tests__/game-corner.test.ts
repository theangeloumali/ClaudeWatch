import { describe, expect, it } from 'vitest'
import type { SessionRef } from '../../../shared/office/types'
import { createWorldDocument } from '../../../shared/office/world-document'
import { contains, overlaps } from '../../../shared/office/world-document-geometry'
import { resolveEffectiveWorld } from '../effective-world'
import { session, subagent } from '../fixtures'
import { cornerSizes, gameCorner } from '../game-corner'
import { buildLayout, type FloorLayout, type LoungeLayout } from '../layout'
import { createAgent } from '../behaviour'
import { FloorRoutes } from '../world-floor-routes'
import { PathCache } from '../navigation'
import { generatedMap, rosters } from './generated-floors'
import { WORKER_BODY_RADIUS } from '../../../shared/office/body-footprints'
import { LOUNGE_WIDTH } from '../rooms'

const SCREEN_METRES = 1.2
const EPSILON = 1e-6

// Where a corner's screen stands: the box edge its seats face, and that edge's outward normal.
function screenEdge(corner: LoungeLayout) {
  const facing = { x: Math.sin(corner.slots[0].heading), z: Math.cos(corner.slots[0].heading) }
  const half = (Math.abs(facing.x) > 0.5 ? corner.width : corner.depth) / 2
  return { facing, edge: { x: corner.x + facing.x * half, z: corner.z + facing.z * half } }
}
const toScreen = (corner: LoungeLayout, point: { x: number; z: number }): number => {
  const { facing, edge } = screenEdge(corner)
  return (edge.x - point.x) * facing.x + (edge.z - point.z) * facing.z
}

// One company of three projects, the last on two storeys; office counts 1, 2 and 6.
function city() {
  const sessions: SessionRef[] = [
    session('claude:a-0', 'p_a'),
    ...[0, 1].map((index) => session(`claude:b-${index}`, 'p_b')),
    ...Array.from({ length: 6 }, (_, index) => ({
      ...session(`claude:c-${index}`, 'p_c'),
      subagents: index ? [] : [subagent('x'), subagent('y'), subagent('z')]
    }))
  ]
  const base = buildLayout(sessions, undefined)
  const document = createWorldDocument(base, sessions)
  const tall = document.buildings.find((building) => building.projectKey === 'p_c')!
  tall.floors = 2
  document.rooms
    .filter((room) => room.buildingId === tall.id)
    .slice(0, 2)
    .forEach((room) => (room.floorNumber = 2))
  return resolveEffectiveWorld(base, document, sessions)
}

const cornerOf = (floor: FloorLayout): LoungeLayout | undefined => floor.zones[0]?.lounge
const desksOf = (floor: FloorLayout) =>
  floor.rooms.flatMap((room) => room.slots.filter((slot) => slot.id !== 'door'))

describe('game corner: one beside the offices on every floor', () => {
  const map = city()
  const withOffices = map.floors.filter((floor) => floor.rooms.length)

  it('lays a corner on every floor with offices, named for its floor', () => {
    expect(withOffices.length).toBe(4)
    expect(withOffices.map((floor) => cornerOf(floor)?.id)).toEqual(
      withOffices.map((floor) => `${floor.id}:games`)
    )
  })

  it('keeps every corner inside its walls, clear of offices, the lift and a ground floor entrance', () => {
    for (const floor of withOffices) {
      const corner = cornerOf(floor)!
      const local = { ...corner, x: corner.x - floor.x, z: corner.z - floor.z }
      const entrance = { ...floor.entrance!, width: 0, depth: 0 }
      expect({
        floor: floor.id,
        isInside: contains(floor, local, 1),
        offices: floor.rooms.filter((room) => overlaps(corner, room, 1 - EPSILON)).length,
        isOnLift: !!floor.connector && overlaps(corner, floor.connector),
        isAtEntrance: floor.floorNumber === 1 && overlaps(corner, entrance, 2 - EPSILON)
      }).toEqual({
        floor: floor.id,
        isInside: true,
        offices: 0,
        isOnLift: false,
        isAtEntrance: false
      })
    }
  })

  it('seats one per desk up to eight, in rows of four', () => {
    expect(withOffices.map((floor) => cornerOf(floor)!.slots.length)).toEqual(
      withOffices.map((floor) => Math.min(8, desksOf(floor).length))
    )
    for (const floor of withOffices) {
      const corner = cornerOf(floor)!
      const facing = { x: Math.sin(corner.slots[0].heading), z: Math.cos(corner.slots[0].heading) }
      const rows = new Map<number, number>()
      for (const seat of corner.slots) {
        const depth = Math.round((seat.x * facing.x + seat.z * facing.z) * 1000)
        rows.set(depth, (rows.get(depth) ?? 0) + 1)
      }
      expect(Math.max(...rows.values())).toBeLessThanOrEqual(4)
    }
  })

  it('faces every seat at a screen on an edge away from the door, with room before it', () => {
    for (const floor of withOffices) {
      const corner = cornerOf(floor)!
      for (const seat of corner.slots)
        expect({
          toScreen: toScreen(corner, seat) >= SCREEN_METRES - EPSILON,
          isDoorOffScreenEdge: toScreen(corner, corner.door) > EPSILON
        }).toEqual({ toScreen: true, isDoorOffScreenEdge: true })
      // The door edge faces the offices: the door is nearer them than the box centre is.
      const nearest = (point: { x: number; z: number }) =>
        Math.min(...floor.rooms.map((room) => Math.hypot(room.x - point.x, room.z - point.z)))
      expect(nearest(corner.door)).toBeLessThan(nearest(corner))
    }
  })

  it('reaches every seat from every desk on its floor', () => {
    expect(unreachableSeats(map, withOffices)).toEqual([])
  })

  // The renderer stands the screen and cabinets there: no walker crosses it, or brushes it.
  it('closes the strip before the screen, and a body around it, leaving every seat open', () => {
    for (const floor of withOffices) {
      const corner = cornerOf(floor)!
      const grid = new PathCache(floor)
      const { facing, edge } = screenEdge(corner)
      const across = { x: -facing.z, z: facing.x }
      const span = (Math.abs(facing.x) > 0.5 ? corner.depth : corner.width) / 2
      const strip = [-0.5, 0.1, 0.5, 0.9].flatMap((back) =>
        [-1.03, -1, -0.5, 0, 0.5, 1, 1.03].map((share) => ({
          x: edge.x - facing.x * back + across.x * share * span,
          z: edge.z - facing.z * back + across.z * share * span
        }))
      )
      expect({
        openInStrip: strip.filter((point) => grid.isOpen(point)).length,
        closedSeats: corner.slots.filter((seat) => !grid.isOpen(seat)).length
      }).toEqual({ openInStrip: 0, closedSeats: 0 })
    }
  })
})

const unreachableSeats = (map: ReturnType<typeof city>, floors: readonly FloorLayout[]) => {
  const routes = new FloorRoutes()
  routes.update(map)
  const unreachable: string[] = []
  for (const floor of floors)
    for (const room of floor.rooms)
      for (const desk of room.slots.filter((slot) => slot.id !== 'door')) {
        const view = createAgent(
          session('claude:walker'),
          {
            floorId: floor.id,
            roomId: room.id,
            slotId: desk.id,
            x: desk.x,
            z: desk.z,
            heading: desk.heading,
            elevation: floor.elevation,
            physicalFloorId: floor.id
          },
          false
        ).view
        for (const seat of cornerOf(floor)!.slots)
          if (!routes.toFloor(view, floor, seat).length)
            unreachable.push(`${floor.id} ${room.id}/${desk.id} -> ${seat.id}`)
      }
  return unreachable
}

describe('game corner: every generated floor of 1 to 24 sessions', () => {
  const maps = rosters().map(generatedMap)
  const floors = maps.flatMap((map) => map.floors.filter((floor) => floor.rooms.length))

  it('gives every generated floor its full corner, inside its walls and clear of its offices', () => {
    const wrong: string[] = []
    for (const floor of floors) {
      const corner = cornerOf(floor)
      if (!corner) continue
      const local = { ...corner, x: corner.x - floor.x, z: corner.z - floor.z }
      const entrance = { ...floor.entrance!, width: 0, depth: 0 }
      const issues = {
        seats: corner.slots.length === Math.min(8, desksOf(floor).length),
        isFullWidth: Math.max(corner.width, corner.depth) >= LOUNGE_WIDTH - EPSILON,
        isInside: contains(floor, local, 1),
        isClear: floor.rooms.every((room) => !overlaps(corner, room, 1 - EPSILON)),
        isOffLift: !floor.connector || !overlaps(corner, floor.connector),
        isOffEntrance: !overlaps(corner, entrance, 2 - EPSILON)
      }
      for (const [check, isMet] of Object.entries(issues))
        if (!isMet) wrong.push(`${floor.id}: ${check}`)
    }
    expect(wrong).toEqual([])
  })

  it('reaches every seat from every desk on its floor', () => {
    const unreachable = maps
      .filter((_, index) => index % 4 === 0)
      .flatMap((map) =>
        unreachableSeats(
          map,
          map.floors.filter((floor) => floor.rooms.length)
        )
      )
    expect(unreachable).toEqual([])
  })
})

// Offices at the same spot on both storeys; the far side's corner ends 1.4 m from the street door.
it('keeps only the ground floor corner clear of the street door', () => {
  const sessions = Array.from({ length: 4 }, (_, index) => session(`claude:c-${index}`, 'p_c'))
  const base = buildLayout(sessions, undefined)
  const document = createWorldDocument(base, sessions)
  document.buildings[0].floors = 2
  document.rooms.forEach((room, index) => {
    room.floorNumber = index < 2 ? 1 : 2
    room.position = { x: index % 2 ? -0.05 : -7.05, z: 3 }
  })
  // Within 2 m of where the street door is: only the upper floor may be, having no door.
  const isAtDoor = resolveEffectiveWorld(base, document, sessions).floors.map((floor) =>
    overlaps(cornerOf(floor)!, { ...floor.entrance!, width: 0, depth: 0 }, 2 - EPSILON)
  )
  expect(isAtDoor).toEqual([false, true])
})

describe('game corner: placement', () => {
  const office = (x: number, z: number) => ({ x, z, width: 4, depth: 4 })
  const floor = (width: number, depth: number, entrance = { x: 0, z: -depth / 2 }) => ({
    floorId: 'b:1',
    footprint: { x: 0, z: 0, width, depth },
    rooms: [office(0, 0)],
    entrance,
    deskCount: 3
  })

  it('takes the side away from the camera first when it has room', () => {
    const corner = gameCorner(floor(30, 30, { x: 0, z: 15 }))
    expect(corner?.slots.map((seat) => seat.heading)).toEqual([Math.PI, Math.PI, Math.PI])
    expect(corner!.z).toBeLessThan(0)
  })

  // The -z corner fits its wall margin here, but its far edge is 1.35 m from the door.
  it('passes over a side whose corner would stand in the entrance, for the -x side', () => {
    const corner = gameCorner(floor(30, 17))
    expect(corner?.slots.map((seat) => seat.heading)).toEqual([
      -Math.PI / 2,
      -Math.PI / 2,
      -Math.PI / 2
    ])
    expect(corner!.x).toBeLessThan(0)
  })

  it('passes over a side whose corner would cover the lift', () => {
    const corner = gameCorner({
      ...floor(30, 30, { x: 0, z: 15 }),
      connector: { x: 0, z: -8, width: 2, depth: 2 }
    })
    expect(corner?.slots[0].heading).toBe(-Math.PI / 2)
  })

  // Against the west wall, too shallow north for a row: only the +x side has room.
  it('turns a corner east of the offices sideways: screen on its -z edge, door on its -x', () => {
    const corner = gameCorner({ ...floor(30, 14), rooms: [office(-11, 0)] })!
    expect(corner.slots.map((seat) => seat.heading)).toEqual([Math.PI, Math.PI, Math.PI])
    expect(corner.x).toBeGreaterThan(-9)
    expect(corner.door).toEqual({ x: corner.x - corner.width / 2, z: corner.z })
    // Rows run along x, so the box is a row wide away from the offices and a row deep along them.
    expect(corner.width).toBeCloseTo(LOUNGE_WIDTH, 6)
    expect(corner.depth).toBeCloseTo(SCREEN_METRES + 2.95, 6)
    for (const seat of corner.slots) expect(toScreen(corner, seat)).toBeCloseTo(SCREEN_METRES, 6)
  })

  // Against the north wall, too narrow west and east for a row: only the +z side has room.
  it('turns a corner south of the offices sideways: screen on its -x edge, door on its -z', () => {
    const corner = gameCorner({ ...floor(12, 30, { x: 0, z: 15 }), rooms: [office(0, -11)] })!
    expect(corner.slots.map((seat) => seat.heading)).toEqual([
      -Math.PI / 2,
      -Math.PI / 2,
      -Math.PI / 2
    ])
    expect(corner.z).toBeGreaterThan(-9)
    expect(corner.door).toEqual({ x: corner.x, z: corner.z - corner.depth / 2 })
    expect(corner.width).toBeCloseTo(SCREEN_METRES + 2.95, 6)
    expect(corner.depth).toBeCloseTo(LOUNGE_WIDTH, 6)
  })

  // Ruling: a 5 m deep strip has no camera-facing room, so a floor keeps a corner facing away.
  it('falls back to a corner facing away from the offices when no camera-facing one fits', () => {
    const corner = gameCorner({
      floorId: 'b:2',
      footprint: { x: 0, z: 0, width: 20, depth: 5 },
      rooms: [office(-7, 0)],
      deskCount: 1
    })
    expect(corner?.slots.map((seat) => seat.heading)).toEqual([Math.PI / 2])
  })

  // 8 m east of the office holds a row of two sideways, or a full row of four facing away.
  it('prefers a narrower camera-facing corner to a full one facing away', () => {
    const corner = gameCorner({
      floorId: 'b:2',
      footprint: { x: -2, z: 0, width: 12, depth: 10 },
      rooms: [office(-6, 0)],
      deskCount: 4
    })
    expect(corner?.slots.map((seat) => seat.heading)).toEqual([Math.PI, Math.PI])
  })

  // Six seats: a full front row of four and a centred back row of two.
  it('sits the front row 1.2 m from the screen and the next a walkway nearer the door', () => {
    const corner = gameCorner({ ...floor(30, 30, { x: 0, z: 15 }), deskCount: 6 })!
    const { facing } = screenEdge(corner)
    const across = { x: -facing.z, z: facing.x }
    const rows = [corner.slots.slice(0, 4), corner.slots.slice(4)].map((row) => ({
      seats: row.length,
      toScreen: Math.max(...row.map((seat) => toScreen(corner, seat))),
      offCentre:
        row.reduce(
          (sum, seat) => sum + (seat.x - corner.x) * across.x + (seat.z - corner.z) * across.z,
          0
        ) / row.length
    }))
    expect(rows.map((row) => row.seats)).toEqual([4, 2])
    expect(rows[0].toScreen).toBeCloseTo(SCREEN_METRES, 6)
    // Room to route a worker between two seated workers, its margin each side included.
    expect(rows[1].toScreen - rows[0].toScreen).toBeGreaterThanOrEqual(4 * WORKER_BODY_RADIUS + 0.1)
    for (const row of rows) expect(row.offCentre).toBeCloseTo(0, 6)
  })

  // Half of 20 m holds the 3 m beside the office, a 4.15 m row and the wall, not two rows.
  it('falls back to one row of four on a floor too small for two rows', () => {
    const corner = gameCorner({ ...floor(20, 20), deskCount: 8 })
    const facing = corner && {
      x: Math.sin(corner.slots[0].heading),
      z: Math.cos(corner.slots[0].heading)
    }
    const depths = corner?.slots.map((seat) =>
      Math.round((seat.x * facing!.x + seat.z * facing!.z) * 1000)
    )
    expect({ seats: depths?.length, rows: new Set(depths).size }).toEqual({ seats: 4, rows: 1 })
  })

  // The renderer's screen and cabinets need the full width; a short row narrows only to fit.
  it('keeps a full width corner for a single seat when the floor has room', () => {
    const corner = gameCorner({ ...floor(30, 30, { x: 0, z: 15 }), deskCount: 1 })
    expect(corner && Math.max(corner.width, corner.depth)).toBeCloseTo(LOUNGE_WIDTH, 6)
  })

  // 8 m across leaves 6 m inside the walls: a row of two fits, one of three or four does not.
  it('falls back to fewer seats in a narrower row when a full row does not fit', () => {
    const corner = gameCorner({ ...floor(8, 20), deskCount: 4 })
    expect(corner?.slots).toHaveLength(2)
    expect(corner!.width).toBeLessThanOrEqual(6)
  })

  it('leaves a floor with no room on any side without a corner', () => {
    expect(gameCorner(floor(8, 8))).toBeUndefined()
  })

  it('leaves a floor with no offices without a corner', () => {
    expect(gameCorner({ ...floor(30, 30), rooms: [] })).toBeUndefined()
  })

  // Seat counts sharing a row count share an area, so one is tried per row count (M6).
  it('tries one full-width size per row count, then narrower single rows', () => {
    const full = LOUNGE_WIDTH
    const row = (seats: number) => (1 + 1.25 * seats) * (LOUNGE_WIDTH / 6)
    expect([...cornerSizes(8)]).toEqual([
      { seats: 8, across: full },
      { seats: 4, across: full },
      { seats: 3, across: row(3) },
      { seats: 2, across: row(2) },
      { seats: 1, across: row(1) }
    ])
    expect([...cornerSizes(3)]).toEqual([
      { seats: 3, across: full },
      { seats: 3, across: row(3) },
      { seats: 2, across: row(2) },
      { seats: 1, across: row(1) }
    ])
  })
})
