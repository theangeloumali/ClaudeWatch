import { boundsOfZone } from '../logic/zone-framing'
import type { FloorGeometry } from '../scene-model'
import { LIVE_FLOORS } from '../themes/floors.test-utils'
import { rectOf, type Rect } from '../themes/lot-math'
import type { TownRoad } from '../../../shared/office/town-roads'

export const [LONE_FLOOR, PAIR_FLOOR, LARGE_FLOOR] = LIVE_FLOORS.map(([, floor]) => floor)

// The plate with its east edge moved by `metres`, as a desk column or a company arriving does.
export function widened(floor: FloorGeometry, metres: number): FloorGeometry {
  return { ...floor, x: floor.x + metres / 2, width: floor.width + metres }
}

export function edges(rect: Rect): { west: number; east: number; north: number; south: number } {
  const { minX, maxX, minZ, maxZ } = boundsOfZone(rect)
  return { west: minX, east: maxX, north: minZ, south: maxZ }
}

export function fromEdges(edge: ReturnType<typeof edges>): Rect {
  return rectOf(edge.west, edge.east, edge.north, edge.south)
}

// The ground a road covers: its centre line as wide as the road.
export function roadStrip(road: TownRoad): Rect {
  const isAlongX = road.from.z === road.to.z
  return {
    x: (road.from.x + road.to.x) / 2,
    z: (road.from.z + road.to.z) / 2,
    width: isAlongX ? Math.abs(road.to.x - road.from.x) : road.width,
    depth: isAlongX ? road.width : Math.abs(road.to.z - road.from.z)
  }
}
