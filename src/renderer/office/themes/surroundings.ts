import type { FloorGeometry, ZoneGeometry } from '../scene-model'
import { contains, draw, gapBetween, rectOf, type Rect } from './lot-math'

// The one seeded pick and the one gap measure every theme shares.
export { draw, gapBetween }

export interface Lot {
  id: string
  kind: 'building' | 'prop'
  // Centre of the footprint, in floor-local metres like every zone.
  x: number
  z: number
  width: number
  depth: number
  // The highest y anything on the lot may reach, so it never hides a desk at any map rotation.
  maxHeight: number
  // A stable 32-bit number for the theme to pick a design from.
  seed: number
  // The company the lot belongs to; null for a lot the floor theme dresses.
  zoneId: string | null
}

// Where the ground plane lies and lots stand: under the slab.
export const GROUND_Y = -0.5
// How far past the plate the camera's extent reaches when the town is off.
export const WORLD_APRON = { west: 12, east: 12, north: 19, south: 8 }

// A thing of height h hides 1.43 h of ground behind it at the camera's 35° elevation.
export const HEIGHT_PER_METRE = 0.7
export const MAX_LOT_HEIGHT_M = 24
// The lowest limit a lot is still worth building under, by kind.
export const MIN_LOT_HEIGHT_M = { building: 2, prop: 0.4 }

function flatten(zones: readonly ZoneGeometry[]): ZoneGeometry[] {
  return zones.flatMap((zone) => [zone, ...flatten(zone.children)])
}

export interface Site {
  plate: Rect
  companies: ZoneGeometry[]
  offices: Rect[]
}

// The band round the plate the camera keeps in view when the town is off.
function apronOf(plate: Rect): Rect {
  return rectOf(
    plate.x - plate.width / 2 - WORLD_APRON.west,
    plate.x + plate.width / 2 + WORLD_APRON.east,
    plate.z - plate.depth / 2 - WORLD_APRON.north,
    plate.z + plate.depth / 2 + WORLD_APRON.south
  )
}

// What nothing may hide: the project offices, else the leaf rooms, else the bare plate.
export function officesOf(floor: FloorGeometry): Rect[] {
  const projects = flatten(floor.zones).filter((zone) => zone.kind === 'project')
  if (projects.length > 0) return projects
  return floor.rooms.length > 0 ? floor.rooms : [floor]
}

// The highest y a thing standing on `rect` may reach without hiding a desk at any map rotation.
export function heightLimit(rect: Rect, offices: readonly Rect[]): number {
  const nearest = Math.min(...offices.map((office) => gapBetween(rect, office)))
  return Math.min(MAX_LOT_HEIGHT_M, nearest * HEIGHT_PER_METRE)
}

export function surveySite(floor: FloorGeometry): Site {
  const companies = floor.zones
    .filter((zone) => zone.kind === 'company')
    .sort((a, b) => a.id.localeCompare(b.id))
  return { plate: floor, companies, offices: officesOf(floor) }
}

// Over the cap, the plate's own lots stay and the ring is thinned by seed, so no side empties.
export function capped(lots: readonly Lot[], limit: number, plate: Rect): Lot[] {
  if (lots.length <= limit) return [...lots]
  const rank = (lot: Lot): number => (contains(plate, lot) ? 0 : 1)
  const kept = new Set(
    [...lots].sort((a, b) => rank(a) - rank(b) || a.seed - b.seed).slice(0, limit)
  )
  return lots.filter((lot) => kept.has(lot))
}

// The box around everything drawn on the ground: what the camera's planes are sized from.
export function sceneExtent(floor: FloorGeometry, lots: readonly Lot[]): Rect {
  const rects: Rect[] = [apronOf(floor), ...lots]
  return rectOf(
    Math.min(...rects.map((rect) => rect.x - rect.width / 2)),
    Math.max(...rects.map((rect) => rect.x + rect.width / 2)),
    Math.min(...rects.map((rect) => rect.z - rect.depth / 2)),
    Math.max(...rects.map((rect) => rect.z + rect.depth / 2))
  )
}
