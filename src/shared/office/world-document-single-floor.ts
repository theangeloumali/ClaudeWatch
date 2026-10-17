import { cornerReach, cornerSeats } from '../../office/sim/game-corner'
import { WORLD_DOCUMENT_LIMITS } from './world-document-limits'
import type { WorldDocument, WorldRoom } from './world-document-types'

const ROOM_GAP_METRES = 3
// Leave room for both the worker diameter and the passage validator's navigation lattice.
const ROOM_EDGE_METRES = 2
const ENTRY_HALL_METRES = 4

// dry-new: footprint packing moves buildings; consolidation must preserve desks while packing rooms.
export function singleFloorWorldDocument(document: WorldDocument): WorldDocument {
  const consolidated = structuredClone(document)
  for (const building of consolidated.buildings) {
    const rooms = consolidated.rooms.filter((room) => room.buildingId === building.id)
    const packed = packRooms(rooms)
    // East of the offices, the edge margin is the corner's room gap and wall margin both.
    const cornerBand = cornerReach(cornerSeats(rooms.flatMap((room) => room.desks).length))
    const width = Math.max(12, packed.width + ROOM_EDGE_METRES * 2 + cornerBand)
    const depth = Math.max(12, packed.depth + ENTRY_HALL_METRES + ROOM_EDGE_METRES)
    if (
      width > WORLD_DOCUMENT_LIMITS.buildingMetres ||
      depth > WORLD_DOCUMENT_LIMITS.buildingMetres
    )
      throw new RangeError(
        `${building.displayName} cannot fit on one floor within the building limit.`
      )
    for (const room of rooms) {
      room.floorNumber = 1
      room.position.x -= width / 2 - ROOM_EDGE_METRES
      room.position.z += -depth / 2 + ENTRY_HALL_METRES
    }
    building.floors = 1
    building.footprint.width = width
    building.footprint.depth = depth
    building.entrance = { x: 0, z: -depth / 2 }
    // Keep the legacy transfer landing until existing upper-floor bodies finish their descent.
    building.connector = { x: -width / 2 + 2, z: -depth / 2 + 2, width: 2, depth: 2 }
  }
  return consolidated
}

function packRooms(rooms: WorldRoom[]) {
  const ordered = [...rooms].sort(
    (first, second) =>
      second.size.depth - first.size.depth ||
      second.size.width - first.size.width ||
      first.id.localeCompare(second.id)
  )
  const area = ordered.reduce(
    (sum, room) => sum + (room.size.width + ROOM_GAP_METRES) * (room.size.depth + ROOM_GAP_METRES),
    0
  )
  const targetWidth = Math.max(8, Math.sqrt(area), ...ordered.map((room) => room.size.width))
  let cursorX = 0
  let cursorZ = 0
  let rowDepth = 0
  let width = 0
  for (const room of ordered) {
    if (cursorX > 0 && cursorX + room.size.width > targetWidth) {
      cursorX = 0
      cursorZ += rowDepth + ROOM_GAP_METRES
      rowDepth = 0
    }
    room.position = { x: cursorX + room.size.width / 2, z: cursorZ + room.size.depth / 2 }
    width = Math.max(width, cursorX + room.size.width)
    cursorX += room.size.width + ROOM_GAP_METRES
    rowDepth = Math.max(rowDepth, room.size.depth)
  }
  return { width, depth: cursorZ + rowDepth }
}
