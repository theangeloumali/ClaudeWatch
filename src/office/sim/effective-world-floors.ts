import { gameCorner } from './game-corner'
import type { FloorLayout, LayoutMap, RoomLayout, ZoneLayout } from './layout'
import { bounds } from './rooms'
import { footprintEdges } from '../../shared/office/world-document-geometry'
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
    // Cloned without the parts each floor replaces: its rooms, and a corner of its own.
    const { lounge: _lounge, children: _projects, ...companyFields } = company
    const { children: _rooms, ...projectFields } = project
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
      const capacity = rooms.reduce((count, room) => count + room.capacity, 0)
      const projectZone: ZoneLayout = {
        ...structuredClone(projectFields),
        id: `${floorId}:project:${project.id}`,
        ...roomEnvelope(rooms, project, building),
        ...metadata,
        displayLabel: building.displayName,
        themeId: building.themeId,
        capacity,
        children: rooms
      }
      const door = {
        x: building.footprint.x + building.entrance.x,
        z: building.footprint.z + building.entrance.z
      }
      const companyZone: ZoneLayout = {
        ...structuredClone(companyFields),
        id: `${floorId}:company:${company.id}`,
        ...building.footprint,
        ...metadata,
        door,
        // The building's name is its project's; the company keeps its own.
        themeId: building.themeId,
        capacity,
        children: rooms.length ? [projectZone] : []
      }
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
      // Every floor with offices gets its own corner; idle agents never leave their floor.
      const corner = gameCorner({
        floorId,
        footprint: building.footprint,
        rooms,
        ...(floorNumber === 1 ? { entrance: door } : {}),
        connector,
        deskCount: rooms.flatMap((room) => room.slots).filter((slot) => slot.id !== 'door').length
      })
      if (corner) companyZone.lounge = corner
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
  const { west, east, north, south } = footprintEdges(rooms, 0.5)
  const envelope = bounds(west, north, east - west, south - north)
  if (project.door.z > project.z) envelope.door.z = south
  return envelope
}
