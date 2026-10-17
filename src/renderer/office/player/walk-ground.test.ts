import { describe, expect, it } from 'vitest'
import { buildFixtureFrame } from '../fixture/fixture-feed'
import {
  DESK_REACH,
  ROOM_DOOR_WIDTH,
  doorSide,
  roomWallSegments,
  SIDE_NORMAL
} from '../logic/room-layout'
import { boundsOfZone } from '../logic/zone-framing'
import { GROUND_Y, sceneExtent } from '../themes/surroundings'
import { distributedTown } from '../town/distributed-town'
import { townOf } from '../town/use-town-plan'
import type { ZoneGeometry } from '../scene-model'
import { doorstep, groundHeight, nearestOpen, walkGround, walkPath } from './walk-ground'

const [floor] = buildFixtureFrame(0, 0).floors
// The ground OfficeScene hands the player: the city on the floor's own site, a first start.
const { plan } = distributedTown(townOf(floor, null), [floor])
const lots = plan.lots
const ground = walkGround(floor, lots, plan.extent)
const gate = nearestOpen(ground, floor.elevator)
if (!gate) throw new Error('No open ground beside the lift')

function flatten(zones: readonly ZoneGeometry[]): ZoneGeometry[] {
  return zones.flatMap((zone) => [zone, ...flatten(zone.children)])
}
const walled = flatten(floor.zones).flatMap((zone) =>
  zone.door ? [{ ...zone, door: zone.door }] : []
)

const SAMPLE_M = 0.1

// Every point a walker passes on the way, a tenth of a metre apart.
function pointsAlong(path: readonly { x: number; z: number }[]) {
  return path.slice(1).flatMap((to, index) => {
    const from = path[index]
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / SAMPLE_M))
    return Array.from({ length: steps + 1 }, (_, step) => ({
      x: from.x + ((to.x - from.x) * step) / steps,
      z: from.z + ((to.z - from.z) * step) / steps
    }))
  })
}

describe('walkGround', () => {
  it('blocks every lot', () => {
    expect(lots.length).toBeGreaterThan(20)
    for (const lot of lots) expect(ground.isOpen(lot)).toBe(false)
  })

  it('blocks the walls of every company, project and office', () => {
    expect(walled.length).toBeGreaterThan(10)
    for (const zone of walled)
      for (const segment of roomWallSegments(zone))
        expect(ground.isOpen(segment), `${zone.id} wall at ${segment.x},${segment.z}`).toBe(false)
  })

  it('does not carve an unrelated solid open where a room has a door', () => {
    const room = floor.rooms[0]
    const blockedDoor = walkGround(floor, [{ ...room.door, width: 1, depth: 1 }], plan.extent)
    expect(blockedDoor.isOpen(room.door)).toBe(false)
  })

  it('opens every door', () => {
    for (const zone of walled) expect(ground.isOpen(zone.door), zone.id).toBe(true)
  })

  it('blocks every desk and the seat behind it', () => {
    for (const room of floor.rooms)
      for (const seat of room.seats) {
        expect(ground.isOpen(seat)).toBe(false)
        const desk = {
          x: seat.x + Math.sin(seat.heading) * DESK_REACH,
          z: seat.z + Math.cos(seat.heading) * DESK_REACH
        }
        expect(ground.isOpen(desk)).toBe(false)
      }
  })

  it('blocks the lift housing while leaving its doorstep, lounges and road crossings open', () => {
    expect(ground.isOpen(floor.elevator)).toBe(false)
    expect(ground.isOpen(gate)).toBe(true)
    for (const company of floor.zones)
      if (company.lounge) expect(ground.isOpen(company.lounge)).toBe(true)
    expect(plan.graph.nodes.length).toBeGreaterThan(50)
    expect(plan.graph.nodes.filter((node) => !ground.isOpen(node))).toEqual([])
  })

  it('is closed outside the town', () => {
    expect(ground.isOpen({ x: 10_000, z: 0 })).toBe(false)
    const { minX } = boundsOfZone(plan.extent)
    expect(ground.isOpen({ x: minX - 5, z: 0 })).toBe(false)
  })

  it('is the floor and its apron alone when there is no town', () => {
    const bare = walkGround(floor, [], sceneExtent(floor, []))
    expect(bare.isOpen(floor.elevator)).toBe(false)
    expect(bare.isOpen(gate)).toBe(true)
    expect(bare.isOpen(plan.lots[0])).toBe(false)
  })
})

describe('nearestOpen', () => {
  it('moves a target inside a building to the nearest open ground', () => {
    const building = plan.lots.find((lot) => lot.kind === 'building')
    if (!building) throw new Error('the seeded town has no building')
    const spot = nearestOpen(ground, building)
    if (!spot) throw new Error('no open ground near the building')
    expect(ground.isOpen(spot)).toBe(true)
    const reach = Math.hypot(building.width, building.depth) / 2 + 1
    expect(Math.hypot(spot.x - building.x, spot.z - building.z)).toBeLessThan(reach)
  })

  it('keeps a target that is already open', () => {
    expect(nearestOpen(ground, gate)).toEqual(gate)
  })
})

describe('walkPath', () => {
  const farCompany = [...floor.zones].sort((a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z))[0]
  const farRoom = [...floor.rooms].sort(
    (a, b) =>
      Math.hypot(a.x - farCompany.x, a.z - farCompany.z) -
      Math.hypot(b.x - farCompany.x, b.z - farCompany.z)
  )[0]

  it('walks from the gate to a desk in the far company without crossing a blocked cell', () => {
    const [seat] = farRoom.seats
    const path = walkPath(ground, gate, seat)
    expect(path.length).toBeGreaterThan(1)
    expect(path[0]).toEqual(gate)
    for (const point of pointsAlong(path)) expect(ground.isOpen(point)).toBe(true)
    const end = path[path.length - 1]
    expect(Math.hypot(end.x - seat.x, end.z - seat.z)).toBeLessThan(1.5)
  })

  it('goes in through the door', () => {
    const path = walkPath(ground, gate, { x: farRoom.x, z: farRoom.z - 1 })
    expect(path.length).toBeGreaterThan(1)
    const outward = SIDE_NORMAL[doorSide(farRoom)]
    const passesDoor = pointsAlong(path).some(
      (point) =>
        Math.abs((point.x - farRoom.door.x) * outward.x + (point.z - farRoom.door.z) * outward.z) <=
          SAMPLE_M &&
        Math.abs((point.x - farRoom.door.x) * outward.z + (point.z - farRoom.door.z) * outward.x) <
          ROOM_DOOR_WIDTH / 2
    )
    expect(passesDoor).toBe(true)
    for (const point of pointsAlong(path)) expect(ground.isOpen(point)).toBe(true)
  })

  const far = [...plan.lots]
    .filter((lot) => lot.kind === 'building')
    .sort((a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z))[0]

  it('walks from the gate to the door of the farthest building without standing in a lot', () => {
    const path = walkPath(ground, gate, far.door)
    expect(path.length).toBeGreaterThan(1)
    const walked = pointsAlong(path)
    for (const point of walked) expect(ground.isOpen(point)).toBe(true)
    const inLot = (point: { x: number; z: number }): boolean =>
      lots.some(
        (lot) =>
          Math.abs(point.x - lot.x) < lot.width / 2 - 0.3 &&
          Math.abs(point.z - lot.z) < lot.depth / 2 - 0.3
      )
    expect(walked.filter(inLot)).toEqual([])
    const end = path[path.length - 1]
    expect(Math.hypot(end.x - far.door.x, end.z - far.door.z)).toBeLessThan(1)
  })

  it('sends a click on a building to the open ground beside it', () => {
    const path = walkPath(ground, gate, far)
    expect(path.length).toBeGreaterThan(1)
    const end = path[path.length - 1]
    expect(ground.isOpen(end)).toBe(true)
    expect(Math.hypot(end.x - far.x, end.z - far.z)).toBeLessThan(
      Math.hypot(far.width, far.depth) / 2 + 1
    )
  })

  it('takes far fewer turns than the grid it searched', () => {
    const path = walkPath(ground, gate, farRoom.seats[0])
    expect(path.length).toBeLessThan(40)
  })
})

describe('doorstep', () => {
  it('stands just outside the door, on open ground', () => {
    for (const zone of walled) {
      const spot = doorstep(zone)
      const outward = SIDE_NORMAL[doorSide(zone)]
      expect(spot.x - zone.door.x).toBeCloseTo(outward.x * 1)
      expect(spot.z - zone.door.z).toBeCloseTo(outward.z * 1)
      expect(ground.isOpen(spot), zone.id).toBe(true)
    }
  })
})

describe('groundHeight', () => {
  it('is the slab on the plate and the town’s ground everywhere else', () => {
    expect(groundHeight(floor, floor.elevator)).toBe(0)
    const west = floor.x - floor.width / 2
    expect(groundHeight(floor, { x: west - 3, z: 0 })).toBe(GROUND_Y)
    expect(groundHeight(floor, { x: west - 40, z: 0 })).toBe(GROUND_Y)
  })
})
