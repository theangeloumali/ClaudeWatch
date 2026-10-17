import { describe, expect, it } from 'vitest'
import type { SessionRef } from '../../../shared/office/types'
import { createWorldDocument } from '../../../shared/office/world-document'
import { contains, overlaps } from '../../../shared/office/world-document-geometry'
import { resolveEffectiveWorld } from '../effective-world'
import { session, subagent } from '../fixtures'
import { gameCorner } from '../game-corner'
import { buildLayout, type FloorLayout, type LoungeLayout } from '../layout'
import { createAgent } from '../behaviour'
import { FloorRoutes } from '../world-floor-routes'

const SCREEN_METRES = 1.2
const EPSILON = 1e-6

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

  it('keeps every corner inside its walls, clear of offices, the lift and the entrance', () => {
    for (const floor of withOffices) {
      const corner = cornerOf(floor)!
      const local = { ...corner, x: corner.x - floor.x, z: corner.z - floor.z }
      const entrance = { ...floor.entrance!, width: 0, depth: 0 }
      expect({
        floor: floor.id,
        isInside: contains(floor, local, 1),
        offices: floor.rooms.filter((room) => overlaps(corner, room, 1 - EPSILON)).length,
        isOnLift: !!floor.connector && overlaps(corner, floor.connector),
        isAtEntrance: overlaps(corner, entrance, 2 - EPSILON)
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

  it('faces every seat at a screen on the far edge, with room before it', () => {
    for (const floor of withOffices) {
      const corner = cornerOf(floor)!
      for (const seat of corner.slots) {
        const facing = { x: Math.sin(seat.heading), z: Math.cos(seat.heading) }
        const reach = Math.abs(facing.x) > 0.5 ? corner.width : corner.depth
        const farEdge = { x: corner.door.x + facing.x * reach, z: corner.door.z + facing.z * reach }
        const toScreen = (farEdge.x - seat.x) * facing.x + (farEdge.z - seat.z) * facing.z
        const fromDoor = (seat.x - corner.door.x) * facing.x + (seat.z - corner.door.z) * facing.z
        expect({ toScreen: toScreen >= SCREEN_METRES, fromDoor: fromDoor > 0 }).toEqual({
          toScreen: true,
          fromDoor: true
        })
      }
      // The screen side is away from the offices: the door edge faces them.
      const toOffices = floor.rooms.map((room) =>
        Math.hypot(room.x - corner.door.x, room.z - corner.door.z)
      )
      const farSide = {
        x: 2 * corner.x - corner.door.x,
        z: 2 * corner.z - corner.door.z
      }
      expect(
        Math.min(...floor.rooms.map((room) => Math.hypot(room.x - farSide.x, room.z - farSide.z)))
      ).toBeGreaterThan(Math.min(...toOffices))
    }
  })

  it('reaches every seat from every desk on its floor', () => {
    const routes = new FloorRoutes()
    routes.update(map)
    const unreachable: string[] = []
    for (const floor of withOffices)
      for (const room of floor.rooms)
        for (const desk of room.slots.filter((slot) => slot.id !== 'door')) {
          const agent = createAgent(
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
            []
          )
          for (const seat of cornerOf(floor)!.slots)
            if (!routes.toFloor(agent.view, floor, seat).length)
              unreachable.push(`${room.id}/${desk.id} -> ${seat.id}`)
        }
    expect(unreachable).toEqual([])
  })
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

  // The -z corner fits its wall margin here, but its far edge is 1.15 m from the door.
  it('passes over a side whose corner would stand in the entrance', () => {
    const corner = gameCorner(floor(30, 21))
    expect(corner?.slots.map((seat) => seat.heading)).toEqual([
      Math.PI / 2,
      Math.PI / 2,
      Math.PI / 2
    ])
  })

  it('passes over a side whose corner would cover the lift', () => {
    const corner = gameCorner({
      ...floor(30, 30, { x: 0, z: 15 }),
      connector: { x: 0, z: -8, width: 2, depth: 2 }
    })
    expect(corner?.slots[0].heading).toBe(Math.PI / 2)
  })

  it('leaves a floor with no room on any side without a corner', () => {
    expect(gameCorner(floor(8, 8))).toBeUndefined()
  })

  it('leaves a floor with no offices without a corner', () => {
    expect(gameCorner({ ...floor(30, 30), rooms: [] })).toBeUndefined()
  })
})
