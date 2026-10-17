import {
  buildLayout,
  type LayoutMap,
  type LoungeLayout,
  type RoomLayout,
  type Slot,
  type ZoneLayout
} from '../../office/sim/layout'
import type { SessionRef } from '../../shared/office/types'
import type {
  DeskSlot,
  FloorGeometry,
  LoungeGeometry,
  RoomGeometry,
  ZoneGeometry
} from '../office/scene-model'

function toSeat(slot: Slot): DeskSlot {
  return { slotId: slot.id, x: slot.x, z: slot.z, heading: slot.heading }
}

export function toLounge(lounge: LoungeLayout): LoungeGeometry {
  return {
    id: lounge.id,
    x: lounge.x,
    z: lounge.z,
    width: lounge.width,
    depth: lounge.depth,
    door: { ...lounge.door },
    seats: lounge.slots.map(toSeat)
  }
}

function toZone(zone: ZoneLayout, labels: Map<string, string>): ZoneGeometry {
  return {
    id: zone.id,
    kind: zone.kind,
    label:
      zone.displayLabel ??
      (zone.sessionKey ? (labels.get(zone.sessionKey) ?? zone.label) : zone.label),
    x: zone.x,
    z: zone.z,
    width: zone.width,
    depth: zone.depth,
    door: { ...zone.door },
    companyKey: zone.companyKey,
    projectKey: zone.projectKey,
    sessionKey: zone.sessionKey,
    children: zone.children.map((child) => toZone(child, labels)),
    ...displayMetadata(zone),
    ...(zone.lounge ? { lounge: toLounge(zone.lounge) } : {})
  }
}

function toRoom(room: RoomLayout, labels: Map<string, string>): RoomGeometry {
  return {
    id: room.id,
    worldTarget: room.worldTarget,
    sessionKey: room.sessionKey,
    x: room.x,
    z: room.z,
    width: room.width,
    depth: room.depth,
    door: { ...room.door },
    label:
      room.displayLabel ??
      (room.sessionKey ? (labels.get(room.sessionKey) ?? room.label) : room.label),
    kind: room.kind,
    ...(room.kind === 'office' ? { bay: room.bay } : {}),
    seats: room.slots.filter((slot) => slot.id !== 'door').map(toSeat),
    ...displayMetadata(room)
  }
}

type EffectiveFloorGeometry = FloorGeometry & {
  buildingId?: string
  floorNumber?: number
  elevation?: number
  displayLabel?: string
  themeId?: string
}

function displayMetadata(
  source: Pick<ZoneLayout, 'buildingId' | 'floorNumber' | 'elevation' | 'displayLabel' | 'themeId'>
) {
  return {
    ...(source.buildingId === undefined ? {} : { buildingId: source.buildingId }),
    ...(source.floorNumber === undefined ? {} : { floorNumber: source.floorNumber }),
    ...(source.elevation === undefined ? {} : { elevation: source.elevation }),
    ...(source.displayLabel === undefined ? {} : { displayLabel: source.displayLabel }),
    ...(source.themeId === undefined ? {} : { themeId: source.themeId })
  }
}

export function toFloorGeometry(
  layout: LayoutMap,
  sessions: readonly SessionRef[],
  options: { keepEmptyHeadquarters?: boolean } = {}
): EffectiveFloorGeometry[] {
  const labels = new Map(sessions.map((session) => [session.key, session.name]))
  // A map saved by the floor-per-project version has no zones and is replaced, as buildLayout does.
  const floors =
    (layout.floors.length > 0 || options.keepEmptyHeadquarters === false) &&
    layout.floors.every((floor) => Array.isArray(floor.zones))
      ? layout.floors
      : buildLayout([...sessions], undefined).floors
  return floors.map((floor, plate) => ({
    floorId: floor.id,
    ...(layout.streetBlocks ? { streetBlocks: layout.streetBlocks } : {}),
    label: floor.floorNumber
      ? `${floor.displayLabel ?? floor.label} · Floor ${floor.floorNumber}`
      : (floor.displayLabel ?? floor.label),
    plate,
    x: floor.x,
    z: floor.z,
    width: floor.width,
    depth: floor.depth,
    corridor: { z: 0, width: 3 },
    rooms: floor.rooms.map((r) => toRoom(r, labels)),
    zones: floor.zones.map((z) => toZone(z, labels)),
    elevator: { x: floor.elevator.x, z: floor.elevator.z },
    ...(floor.entrance ? { entrance: { x: floor.entrance.x, z: floor.entrance.z } } : {}),
    ...(floor.connector ? { connector: { x: floor.connector.x, z: floor.connector.z } } : {}),
    ...displayMetadata(floor)
  }))
}
