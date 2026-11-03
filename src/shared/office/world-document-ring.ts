import { WORLD_DOCUMENT_LIMITS } from './world-document-limits'
import type { WorldBuilding, WorldDocument } from './world-document-types'

// The open plaza at the origin that every Campus spoke ends on.
export const CAMPUS_HUB_RADIUS_M = 9
const CAMPUS_GAP_M = 4
const INNER_RING_CAPACITY = 10

const boundingRadius = ({ footprint }: WorldBuilding): number =>
  Math.hypot(footprint.width, footprint.depth) / 2

// Smallest radius at which `slots` equal steps keep the widest neighbours a gap apart.
function ringRadius(buildings: readonly WorldBuilding[], minimum: number, slots: number): number {
  const widest = Math.max(...buildings.map(boundingRadius))
  const spacing = slots > 1 ? (2 * widest + CAMPUS_GAP_M) / (2 * Math.sin(Math.PI / slots)) : 0
  return Math.ceil(Math.max(minimum + widest, spacing))
}

// The outer ring sits in the inner ring's gaps, so every road to the hub runs between rooms;
// it never holds more rooms than the inner ring has gaps.
function ringSizes(count: number): [number, number] {
  const inner =
    count <= INNER_RING_CAPACITY ? count : Math.max(INNER_RING_CAPACITY, Math.ceil(count / 2))
  return [inner, count - inner]
}

// Where a plate's road leaves for the hub: its edge on the line from its centre to the hub, so
// a road between two inner rooms keeps to the middle of their gap.
export function campusRoadStart(plate: { x: number; z: number; width: number; depth: number }): {
  x: number
  z: number
} {
  const distance = Math.hypot(plate.x, plate.z)
  if (distance === 0) return { x: 0, z: 0 }
  const towardHub = { x: -plate.x / distance, z: -plate.z / distance }
  const toEdge = Math.min(
    towardHub.x === 0 ? Infinity : plate.width / 2 / Math.abs(towardHub.x),
    towardHub.z === 0 ? Infinity : plate.depth / 2 / Math.abs(towardHub.z)
  )
  return { x: plate.x + towardHub.x * toEdge, z: plate.z + towardHub.z * toEdge }
}

// Clockwise from the top (-z), so the first project sits at twelve o'clock.
function place(building: WorldBuilding, radius: number, angle: number): void {
  const footprint = building.footprint
  footprint.x = radius * Math.sin(angle)
  footprint.z = -radius * Math.cos(angle)
  if (
    Math.abs(footprint.x) + footprint.width / 2 > WORLD_DOCUMENT_LIMITS.worldMetres ||
    Math.abs(footprint.z) + footprint.depth / 2 > WORLD_DOCUMENT_LIMITS.worldMetres
  )
    throw new RangeError('Campus ring exceeds the coordinate limits.')
}

// Campus puts each building on a ring round a free hub; translation only, so rooms stay valid.
export function ringWorldDocument(document: WorldDocument): WorldDocument {
  const ringed = structuredClone(document)
  ringed.venues = []
  const ordered = ringed.buildings.toSorted(
    (first, second) =>
      first.companyKey.localeCompare(second.companyKey) ||
      first.projectKey.localeCompare(second.projectKey) ||
      first.id.localeCompare(second.id)
  )
  const [innerCount] = ringSizes(ordered.length)
  const inner = ordered.slice(0, innerCount)
  const outer = ordered.slice(innerCount)
  const innerStep = (2 * Math.PI) / Math.max(innerCount, 1)
  const innerRadius = ringRadius(inner, CAMPUS_HUB_RADIUS_M + CAMPUS_GAP_M, innerCount)
  inner.forEach((building, index) => place(building, innerRadius, index * innerStep))
  if (outer.length) {
    const clearance = innerRadius + Math.max(...inner.map(boundingRadius)) + CAMPUS_GAP_M
    const outerRadius = ringRadius(outer, clearance, innerCount)
    outer.forEach((building, index) => {
      const gap = Math.floor((index * innerCount) / outer.length)
      place(building, outerRadius, (gap + 0.5) * innerStep)
    })
  }
  return ringed
}
