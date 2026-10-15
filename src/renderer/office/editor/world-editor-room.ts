import type { WorldRoom } from '../../../shared/office/world-document'
import type { RoomGeometry } from '../scene-model'

export function editableRoomGeometry(room: WorldRoom, label: string): RoomGeometry {
  return {
    id: room.id,
    sessionKey: room.target.startsWith('session:') ? room.target.slice(8) : null,
    label: room.displayName ?? label,
    kind: room.target.startsWith('team:') ? 'team' : 'office',
    ...room.position,
    ...room.size,
    door: room.door,
    themeId: room.themeId,
    seats: room.desks.map((desk) => ({
      slotId: desk.id,
      x: desk.x,
      z: desk.z,
      heading: desk.heading
    }))
  }
}

export function editedWorldRoom(room: WorldRoom, changes: Partial<RoomGeometry>): WorldRoom {
  return {
    ...room,
    position: { x: changes.x ?? room.position.x, z: changes.z ?? room.position.z },
    size: { width: changes.width ?? room.size.width, depth: changes.depth ?? room.size.depth },
    door: changes.door ?? room.door,
    ...(changes.label === undefined ? {} : { displayName: changes.label }),
    ...(Object.hasOwn(changes, 'themeId') ? { themeId: changes.themeId } : {}),
    desks:
      changes.seats?.map((seat) => ({
        id: seat.slotId,
        x: seat.x,
        z: seat.z,
        heading: seat.heading
      })) ?? room.desks
  }
}
