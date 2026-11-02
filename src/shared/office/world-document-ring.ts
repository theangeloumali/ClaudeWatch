import { WORLD_DOCUMENT_LIMITS } from './world-document-limits'
import type { WorldBuilding, WorldDocument } from './world-document-types'

// The open plaza at the origin that every Campus spoke ends on.
export const CAMPUS_HUB_RADIUS_M = 9
const CAMPUS_GAP_M = 4
const INNER_RING_CAPACITY = 10

const boundingRadius = ({ footprint }: WorldBuilding): number =>
  Math.hypot(footprint.width, footprint.depth) / 2

// Smallest radius at which n equal steps keep the widest neighbours a gap apart.
function ringRadius(buildings: readonly WorldBuilding[], minimum: number): number {
  const widest = Math.max(...buildings.map(boundingRadius))
  const spacing =
    buildings.length > 1
      ? (2 * widest + CAMPUS_GAP_M) / (2 * Math.sin(Math.PI / buildings.length))
      : 0
  return Math.ceil(Math.max(minimum + widest, spacing))
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
  const rings = [ordered.slice(0, INNER_RING_CAPACITY), ordered.slice(INNER_RING_CAPACITY)]
  let clearance = CAMPUS_HUB_RADIUS_M + CAMPUS_GAP_M
  for (const ring of rings) {
    if (!ring.length) continue
    const radius = ringRadius(ring, clearance)
    for (const [index, building] of ring.entries()) {
      // Clockwise from the top (-z), so the first project sits at twelve o'clock.
      const angle = (2 * Math.PI * index) / ring.length
      const footprint = building.footprint
      footprint.x = radius * Math.sin(angle)
      footprint.z = -radius * Math.cos(angle)
      if (
        Math.abs(footprint.x) + footprint.width / 2 > WORLD_DOCUMENT_LIMITS.worldMetres ||
        Math.abs(footprint.z) + footprint.depth / 2 > WORLD_DOCUMENT_LIMITS.worldMetres
      )
        throw new RangeError('Campus ring exceeds the coordinate limits.')
    }
    clearance = radius + Math.max(...ring.map(boundingRadius)) + CAMPUS_GAP_M
  }
  return ringed
}
