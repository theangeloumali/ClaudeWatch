import { describe, expect, it } from 'vitest'
import {
  doorSide,
  floorWallSegments,
  inwardHeading,
  doorSignPlacement,
  roomWallSegments,
  wallHeight,
  WALL_HEIGHT_FULL,
  WALL_HEIGHT_LOW,
  ROOM_DOOR_WIDTH
} from '../logic/room-layout'
import { makeRoom } from './fixtures'

// Room centred at (0,-4), 6 m wide, 5 m deep, door on its south wall (z = -1.5) facing the corridor.
const room = makeRoom({ id: 'r1', x: 0, z: -4, width: 6, depth: 5, door: { x: 0, z: -1.5 } })

describe('doorSide', () => {
  it('finds the wall the door sits on', () => {
    expect(doorSide(room)).toBe('south')
    expect(doorSide(makeRoom({ id: 'r2', x: 0, z: 4, door: { x: 0, z: 1.5 } }))).toBe('north')
  })
})

describe('inwardHeading', () => {
  it('looks from the doorway into the room', () => {
    // Door is south (+z side), so looking in means facing -z.
    expect(Math.cos(inwardHeading(room))).toBeCloseTo(-1)
    const northDoor = makeRoom({ id: 'r2', x: 0, z: 4, door: { x: 0, z: 1.5 } })
    expect(Math.cos(inwardHeading(northDoor))).toBeCloseTo(1)
  })
})

describe('doorSignPlacement', () => {
  it('hangs the sign on the corridor side of the door, facing the corridor', () => {
    const southDoor = doorSignPlacement(room)
    expect(southDoor.z).toBeGreaterThan(room.door.z)
    expect(southDoor.rotationY).toBeCloseTo(0)
    const northDoor = doorSignPlacement(makeRoom({ id: 'r2', x: 0, z: 4, door: { x: 0, z: 1.5 } }))
    expect(northDoor.z).toBeLessThan(1.5)
    expect(Math.abs(northDoor.rotationY)).toBeCloseTo(Math.PI)
  })
})

describe('roomWallSegments', () => {
  it('splits the door wall around a gap and keeps the other three whole', () => {
    const segments = roomWallSegments(room)
    expect(segments).toHaveLength(5)
    const doorWallLength = segments
      .filter((segment) => segment.normalZ === 1)
      .reduce((sum, segment) => sum + segment.length, 0)
    expect(doorWallLength).toBeCloseTo(room.width - ROOM_DOOR_WIDTH)
  })
})

describe('wallHeight', () => {
  const southWall = roomWallSegments(room).find((segment) => segment.normalZ === 1)
  const northWall = roomWallSegments(room).find((segment) => segment.normalZ === -1)

  it('keeps every wall up in Up mode and low in Down mode', () => {
    expect(southWall && wallHeight('up', southWall, { x: 0, z: 30 })).toBe(WALL_HEIGHT_FULL)
    expect(northWall && wallHeight('down', northWall, { x: 0, z: 30 })).toBe(WALL_HEIGHT_LOW)
  })

  it('lowers only the walls facing the camera in Cutaway mode', () => {
    expect(southWall && wallHeight('cutaway', southWall, { x: 0, z: 30 })).toBe(WALL_HEIGHT_LOW)
    expect(northWall && wallHeight('cutaway', northWall, { x: 0, z: 30 })).toBe(WALL_HEIGHT_FULL)
  })
})

describe('floorWallSegments', () => {
  it('leaves the same doorway in every room, wherever it sits in the list', () => {
    const rooms = Array.from({ length: 6 }, (_, index) =>
      makeRoom({ id: `r${index}`, x: index * 8, z: -4, door: { x: index * 8, z: -1.5 } })
    )
    const segments = floorWallSegments(rooms)
    for (const candidate of rooms) {
      const doorWall = segments.filter(
        (segment) => segment.roomId === candidate.id && segment.normalZ === 1
      )
      // Every room uses the shared doorway width, not its flatMap index.
      expect(doorWall).toHaveLength(2)
      expect(doorWall.reduce((total, segment) => total + segment.length, 0)).toBeCloseTo(
        candidate.width - ROOM_DOOR_WIDTH
      )
    }
  })
})
