import type { FloorLayout, LayoutMap, LoungeLayout, RoomLayout, ZoneLayout } from './layout'
import { bounds } from './rooms'
import {
  WORLD_STOREY_METRES,
  worldRoomTarget,
  type WorldBuilding,
  type WorldDocument,
  type WorldRoom
} from '../../shared/office/world-document'

interface EffectiveFloorOptions {
  baseline: LayoutMap
  legacy: LayoutMap
  document: WorldDocument
}
export function buildEffectiveFloors({
  baseline,
  legacy,
  document
}: EffectiveFloorOptions): FloorLayout[] {
  const sources = baseline.floors.flatMap((floor) => floor.rooms)
  const legacyRooms = new Map(
    legacy.floors.flatMap((floor) => floor.rooms).map((room) => [worldRoomTarget(room), room])
  )
  const floors: FloorLayout[] = []
  for (const building of document.buildings) {
    const assignedTargets = new Set(
      document.rooms.filter((room) => room.buildingId === building.id).map((room) => room.target)
    )
    const home = sources.find((room) => assignedTargets.has(worldRoomTarget(room)))
    const companies = baseline.floors.flatMap((floor) => floor.zones)
    const company =
      companies.find((zone) => zone.companyKey === building.companyKey) ??
      companies.find((zone) => zone.companyKey === home?.companyKey)
    const project =
      company?.children.find((zone) => zone.projectKey === building.projectKey) ??
      companies
        .flatMap((zone) => zone.children)
        .find(
          (zone) => zone.companyKey === home?.companyKey && zone.projectKey === home?.projectKey
        )
    if (!company || !project) continue
    for (let floorNumber = 1; floorNumber <= building.floors; floorNumber++) {
      const floorId = `${building.id}:${floorNumber}`
      const elevation = (floorNumber - 1) * WORLD_STOREY_METRES
      const metadata = { buildingId: building.id, floorId, floorNumber, elevation }
      const rooms = document.rooms
        .filter((room) => room.buildingId === building.id && room.floorNumber === floorNumber)
        .flatMap((override) => {
          const source = sources.find((room) => worldRoomTarget(room) === override.target)
          return source
            ? [
                effectiveRoom({
                  source,
                  legacy: legacyRooms.get(override.target),
                  override,
                  building,
                  metadata
                })
              ]
            : []
        })
      const lounge =
        floorNumber === 1 &&
        company.children[0]?.projectKey === building.projectKey &&
        company.lounge
          ? effectiveLounge(company.lounge, building)
          : undefined
      const capacity = rooms.reduce((count, room) => count + room.capacity, 0)
      const projectZone: ZoneLayout = {
        ...structuredClone(project),
        id: `${floorId}:project:${project.id}`,
        ...roomEnvelope(rooms, project, building),
        ...metadata,
        displayLabel: building.displayName,
        themeId: building.themeId,
        capacity,
        children: rooms
      }
      const companyZone: ZoneLayout = {
        ...structuredClone(company),
        id: `${floorId}:company:${company.id}`,
        ...building.footprint,
        ...metadata,
        door: {
          x: building.footprint.x + building.entrance.x,
          z: building.footprint.z + building.entrance.z
        },
        // The building's name is its project's; the company keeps its own.
        themeId: building.themeId,
        capacity,
        children: rooms.length ? [projectZone] : []
      }
      delete companyZone.lounge
      if (lounge) companyZone.lounge = lounge
      const connector = building.connector
        ? {
            ...building.connector,
            x: building.footprint.x + building.connector.x,
            z: building.footprint.z + building.connector.z,
            door: {
              x: building.footprint.x + building.connector.x,
              z: building.footprint.z + building.connector.z
            }
          }
        : undefined
      floors.push({
        id: floorId,
        label: project.label,
        ...building.footprint,
        ...metadata,
        displayLabel: building.displayName,
        themeId: building.themeId,
        rooms,
        zones: [companyZone],
        entrance: { id: 'entrance', x: companyZone.door.x, z: companyZone.door.z, heading: 0 },
        elevator: {
          id: 'connector',
          x: connector?.x ?? companyZone.door.x,
          z: connector?.z ?? companyZone.door.z,
          heading: 0
        },
        ...(connector ? { connector } : {})
      })
    }
  }
  return floors
}

function effectiveRoom(options: {
  source: RoomLayout
  legacy: RoomLayout | undefined
  override: WorldRoom
  building: WorldBuilding
  metadata: { buildingId: string; floorId: string; floorNumber: number; elevation: number }
}): RoomLayout {
  const { source, legacy, override, building, metadata } = options
  const x = building.footprint.x + override.position.x
  const z = building.footprint.z + override.position.z
  const door = { x: x + override.door.x, z: z + override.door.z }
  return {
    ...structuredClone(source),
    label: legacy?.label ?? source.label,
    ...metadata,
    worldTarget: override.target,
    x,
    z,
    ...override.size,
    door,
    children: [],
    displayLabel: override.displayName,
    themeId: override.themeId ?? building.themeId,
    slots: [
      { id: 'door', ...door, heading: 0 },
      ...override.desks.map((desk) => ({ ...desk, x: x + desk.x, z: z + desk.z }))
    ]
  }
}
function roomEnvelope(
  rooms: RoomLayout[],
  project: ZoneLayout,
  building: WorldBuilding
): ReturnType<typeof bounds> {
  if (!rooms.length) return bounds(building.footprint.x - 1, building.footprint.z - 1, 2, 2)
  const west = Math.min(...rooms.map((room) => room.x - room.width / 2)) - 0.5
  const east = Math.max(...rooms.map((room) => room.x + room.width / 2)) + 0.5
  const north = Math.min(...rooms.map((room) => room.z - room.depth / 2)) - 0.5
  const south = Math.max(...rooms.map((room) => room.z + room.depth / 2)) + 0.5
  const envelope = bounds(west, north, east - west, south - north)
  if (project.door.z > project.z) envelope.door.z = south
  return envelope
}
function effectiveLounge(lounge: LoungeLayout, building: WorldBuilding): LoungeLayout {
  const x = building.footprint.x + building.footprint.width / 2 - lounge.width / 2 - 3
  const z = building.footprint.z
  const shiftX = x - lounge.x
  const shiftZ = z - lounge.z
  return {
    ...structuredClone(lounge),
    x,
    z,
    door: { x: lounge.door.x + shiftX, z: lounge.door.z + shiftZ },
    slots: lounge.slots.map((slot) => ({ ...slot, x: slot.x + shiftX, z: slot.z + shiftZ }))
  }
}
