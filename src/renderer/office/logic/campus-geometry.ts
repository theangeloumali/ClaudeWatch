import { CAMPUS_HUB_RADIUS_M, campusRoadStart } from '../../../shared/office/world-document-ring'
import type { FloorGeometry, ZoneGeometry } from '../scene-model'

interface CampusPoint {
  x: number
  z: number
}

export interface CampusSpoke {
  buildingId: string
  projectKey: string | null
  from: CampusPoint
  to: CampusPoint
}

export interface CampusGeometry {
  hub: CampusPoint & { radius: number }
  spokes: CampusSpoke[]
}

function projectKeyOf(zones: readonly ZoneGeometry[]): string | null {
  for (const zone of zones) {
    const key = zone.projectKey ?? projectKeyOf(zone.children)
    if (key) return key
  }
  return null
}

// One spoke per ground plate: from its hub-facing edge to the hub rim facing it.
export function campusGeometry(floors: readonly FloorGeometry[]): CampusGeometry {
  const hub = { x: 0, z: 0, radius: CAMPUS_HUB_RADIUS_M }
  const spokes = floors
    .filter((floor) => (floor.elevation ?? 0) === 0)
    .map((floor) => {
      const from = campusRoadStart(floor)
      const distance = Math.hypot(from.x - hub.x, from.z - hub.z) || 1
      return {
        buildingId: floor.buildingId ?? floor.floorId,
        projectKey: projectKeyOf(floor.zones),
        from,
        to: {
          x: hub.x + ((from.x - hub.x) / distance) * hub.radius,
          z: hub.z + ((from.z - hub.z) / distance) * hub.radius
        }
      }
    })
    .sort((first, second) => first.buildingId.localeCompare(second.buildingId))
  return { hub, spokes }
}

interface CampusBox {
  x: number
  z: number
  width: number
  depth: number
  minY: number
  maxY: number
}

// The night sky reaches well past the ring; Horizon must clip and floor this, not just the ring.
export function campusSkyBox<Box extends CampusBox>(ring: Box): Box {
  const side = Math.max(ring.width, ring.depth) * 3 + 120
  return { ...ring, width: side, depth: side }
}
