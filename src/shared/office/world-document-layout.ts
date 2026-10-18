import {
  buildLayout,
  type LayoutMap,
  type RoomLayout,
  type ZoneLayout
} from '../../office/sim/layout'
import type { SessionRef } from './types'
import { WORLD_DOCUMENT_LIMITS as LIMITS, WORLD_STREET_METRES } from './world-document-limits'
import { allocationFromLayout } from './world-document-allocation'
import { defaultWorldVenues } from './world-document-venues'
import { placeWorldFootprint } from './world-document-packing'
import { arrangeWorldDocument } from './world-document-placement'
import { singleFloorWorldDocument } from './world-document-single-floor'
import type {
  WorldBuilding,
  WorldDocument,
  WorldRoom,
  WorldRoomTarget
} from './world-document-types'

export function worldRoomTarget(
  room: Pick<RoomLayout, 'sessionKey' | 'companyKey' | 'projectKey'>
): WorldRoomTarget {
  return room.sessionKey !== null
    ? `session:${room.sessionKey}`
    : `team:${room.companyKey}:${room.projectKey ?? ''}`
}
export function worldBuildingId(companyKey: string, projectKey: string): string {
  return `building:${encodeURIComponent(companyKey)}:${encodeURIComponent(projectKey)}`
}

export function mergeActiveWorldDocument(
  defaults: WorldDocument,
  saved: WorldDocument
): WorldDocument {
  const buildings = defaults.buildings.map(
    (generated) =>
      saved.buildings.find(
        (building) =>
          building.companyKey === generated.companyKey &&
          building.projectKey === generated.projectKey
      ) ?? generated
  )
  const rooms = defaults.rooms.map((generated) => {
    const overridden = saved.rooms.find((room) => room.target === generated.target)
    if (overridden) return structuredClone(overridden)
    const sourceBuilding = defaults.buildings.find(
      (building) => building.id === generated.buildingId
    )
    const building = buildings.find(
      (candidate) =>
        candidate.companyKey === sourceBuilding?.companyKey &&
        candidate.projectKey === sourceBuilding?.projectKey
    )
    return {
      ...generated,
      buildingId: building?.id ?? generated.buildingId,
      floorNumber: Math.min(generated.floorNumber, building?.floors ?? 1)
    }
  })
  for (const room of rooms) {
    if (buildings.some((building) => building.id === room.buildingId)) continue
    const destination = saved.buildings.find((building) => building.id === room.buildingId)
    if (destination) buildings.push(destination)
  }
  const retainedIds = new Set(saved.buildings.map((building) => building.id))
  for (const building of saved.buildings)
    if (!buildings.some((candidate) => candidate.id === building.id)) buildings.push(building)
  const occupied = [
    ...saved.buildings.map((building) => building.footprint),
    ...saved.venues.map((venue) => venue.footprint)
  ]
  const placedBuildings = buildings.map((building) => {
    if (retainedIds.has(building.id)) return building
    const footprint = placeWorldFootprint({
      footprint: building.footprint,
      occupied,
      clearance: WORLD_STREET_METRES * 2
    })
    occupied.push(footprint)
    return { ...building, footprint }
  })
  return {
    version: 2,
    revision: saved.revision,
    buildings: structuredClone(placedBuildings),
    rooms,
    venues: structuredClone(saved.venues),
    allocation: defaults.allocation
  }
}

interface ProjectSource {
  company: ZoneLayout
  project: ZoneLayout
  rooms: RoomLayout[]
}
export function createWorldDocument(
  layout: LayoutMap,
  sessions: readonly SessionRef[]
): WorldDocument {
  if (layout.floors.some((floor) => floor.buildingId !== undefined))
    return createWorldDocument(buildLayout([...sessions], layout), sessions)
  const liveKeys = new Set(sessions.map((session) => session.key))
  const seen = new Set<string>()
  const projects: ProjectSource[] = []
  for (const floor of layout.floors)
    for (const company of floor.zones ?? []) {
      for (const project of company.children) {
        if (!project.projectKey) continue
        const id = worldBuildingId(company.companyKey, project.projectKey)
        if (seen.has(id)) continue
        const rooms = layout.floors
          .flatMap((source) => source.rooms)
          .filter(
            (room) =>
              room.companyKey === company.companyKey &&
              room.projectKey === project.projectKey &&
              (room.sessionKey === null || liveKeys.has(room.sessionKey))
          )
        if (!rooms.some((room) => room.sessionKey !== null)) continue
        seen.add(id)
        projects.push({ company, project, rooms })
      }
    }
  const includedProjects = projects.slice(0, LIMITS.buildings)
  const buildings = includedProjects.map(defaultBuilding)
  const document = singleFloorWorldDocument({
    version: 2,
    revision: 0,
    buildings,
    rooms: includedProjects.flatMap((source, index) =>
      source.rooms.map((room) => defaultRoom({ source, building: buildings[index], room }))
    ),
    venues: [],
    allocation: allocationFromLayout(layout)
  })
  const pitch = Math.max(
    24,
    ...document.buildings.map(
      (building) =>
        Math.max(building.footprint.width, building.footprint.depth) + WORLD_STREET_METRES
    )
  )
  return arrangeWorldDocument(
    { ...document, venues: defaultWorldVenues(document.buildings, pitch) },
    'streets'
  )
}

// Unsized: singleFloorWorldDocument sizes it round its offices and places its doors.
function defaultBuilding({ company, project }: ProjectSource): WorldBuilding {
  return {
    id: worldBuildingId(company.companyKey, project.projectKey ?? ''),
    companyKey: company.companyKey,
    projectKey: project.projectKey ?? '',
    displayName: Array.from(project.label).slice(0, LIMITS.labels).join('') || 'Project',
    footprint: { x: 0, z: 0, width: 0, depth: 0 },
    floors: 1,
    entrance: { x: 0, z: 0 }
  }
}
function defaultRoom(options: {
  source: ProjectSource
  building: WorldBuilding
  room: RoomLayout
}): WorldRoom {
  const { source, building, room } = options
  const target = worldRoomTarget(room)
  return {
    id: target,
    target,
    buildingId: building.id,
    floorNumber: 1,
    position: {
      x: room.x - source.project.x,
      z: room.z - source.project.z
    },
    size: { width: room.width, depth: room.depth },
    door: { x: room.door.x - room.x, z: room.door.z - room.z },
    desks: room.slots
      .filter((slot) => slot.id !== 'door')
      .map((slot) => ({
        id: slot.id,
        x: slot.x - room.x,
        z: slot.z - room.z,
        heading: slot.heading
      }))
  }
}
