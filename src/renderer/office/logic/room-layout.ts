import type { RoomGeometry } from '../scene-model'

// Any centred rectangle with a door: rooms, and company or project zones.
export type DooredRect = Pick<RoomGeometry, 'x' | 'z' | 'width' | 'depth' | 'door'>
type WalledRect = DooredRect & Pick<RoomGeometry, 'id'>

export type WallSide = 'north' | 'south' | 'east' | 'west'
export type WallsMode = 'up' | 'cutaway' | 'down'
const WALL_SIDES: WallSide[] = ['north', 'south', 'east', 'west']

export interface WallSegment {
  roomId: string
  x: number
  z: number
  length: number
  normalX: number
  normalZ: number
}

// Low walls so the isometric view reads into every room; cutaway drops the near ones further.
export const WALL_HEIGHT_FULL = 1.3
export const WALL_HEIGHT_LOW = 0.25
export const ROOM_DOOR_WIDTH = 1.6
// Distance from a seated agent to the centre of its desk.
export const DESK_REACH = 0.62
// Cosine above which a wall counts as facing the camera in cutaway.
const CUTAWAY_FACING_THRESHOLD = 0.2

// North is -z, south is +z, east is +x, west is -x; normals point out of the room.
export const SIDE_NORMAL: Record<WallSide, { x: number; z: number }> = {
  north: { x: 0, z: -1 },
  south: { x: 0, z: 1 },
  east: { x: 1, z: 0 },
  west: { x: -1, z: 0 }
}

export function doorSide(room: DooredRect): WallSide {
  const distances: Record<WallSide, number> = {
    north: Math.abs(room.door.z - (room.z - room.depth / 2)),
    south: Math.abs(room.door.z - (room.z + room.depth / 2)),
    east: Math.abs(room.door.x - (room.x + room.width / 2)),
    west: Math.abs(room.door.x - (room.x - room.width / 2))
  }
  return WALL_SIDES.reduce((best, side) => (distances[side] < distances[best] ? side : best))
}

// Yaw of someone standing in the doorway and looking into the room.
export function inwardHeading(room: DooredRect): number {
  const outward = SIDE_NORMAL[doorSide(room)]
  return Math.atan2(-outward.x, -outward.z)
}

const SIGN_WALL_OFFSET = 0.1

// The sign hangs just outside the door wall; rotationY turns its face toward the corridor.
export function doorSignPlacement(room: DooredRect): { x: number; z: number; rotationY: number } {
  const outward = SIDE_NORMAL[doorSide(room)]
  return {
    x: room.door.x + outward.x * SIGN_WALL_OFFSET,
    z: room.door.z + outward.z * SIGN_WALL_OFFSET,
    rotationY: Math.atan2(outward.x, outward.z)
  }
}

function sideSegment(room: WalledRect, side: WallSide, from: number, to: number): WallSegment {
  const normal = SIDE_NORMAL[side]
  const isAlongX = normal.z !== 0
  const middle = (from + to) / 2
  return {
    roomId: room.id,
    x: isAlongX ? middle : room.x + (normal.x * room.width) / 2,
    z: isAlongX ? room.z + (normal.z * room.depth) / 2 : middle,
    length: to - from,
    normalX: normal.x,
    normalZ: normal.z
  }
}

export function roomWallSegments(room: WalledRect, doorWidth = ROOM_DOOR_WIDTH): WallSegment[] {
  const withDoor = doorSide(room)
  return WALL_SIDES.flatMap((side) => {
    const isAlongX = SIDE_NORMAL[side].z !== 0
    const start = isAlongX ? room.x - room.width / 2 : room.z - room.depth / 2
    const end = isAlongX ? room.x + room.width / 2 : room.z + room.depth / 2
    if (side !== withDoor) return [sideSegment(room, side, start, end)]
    const doorCentre = isAlongX ? room.door.x : room.door.z
    return [
      sideSegment(room, side, start, doorCentre - doorWidth / 2),
      sideSegment(room, side, doorCentre + doorWidth / 2, end)
    ].filter((segment) => segment.length > 0.05)
  })
}

// Not `rooms.flatMap(roomWallSegments)`: flatMap would pass each room's index as its door width.
export function floorWallSegments(rooms: readonly WalledRect[]): WallSegment[] {
  return rooms.flatMap((room) => roomWallSegments(room))
}

export function wallHeight(
  mode: WallsMode,
  segment: WallSegment,
  camera: { x: number; z: number }
): number {
  if (mode === 'up') return WALL_HEIGHT_FULL
  if (mode === 'down') return WALL_HEIGHT_LOW
  const toCameraX = camera.x - segment.x
  const toCameraZ = camera.z - segment.z
  const distance = Math.hypot(toCameraX, toCameraZ) || 1
  const facing = (segment.normalX * toCameraX + segment.normalZ * toCameraZ) / distance
  return facing > CUTAWAY_FACING_THRESHOLD ? WALL_HEIGHT_LOW : WALL_HEIGHT_FULL
}
