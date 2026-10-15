import { WORLD_DOCUMENT_LIMITS, WORLD_STREET_METRES } from './world-document-limits'
import { overlaps } from './world-document-geometry'
import type {
  WorldBuilding,
  WorldDocument,
  WorldFootprint,
  WorldSize
} from './world-document-types'

// New projects find a free plot; existing saved offices and venues never move implicitly.
export function placeWorldFootprint({
  footprint,
  occupied,
  clearance = WORLD_STREET_METRES
}: {
  footprint: WorldFootprint
  occupied: readonly WorldFootprint[]
  clearance?: number
}): WorldFootprint {
  const candidates = [
    footprint,
    ...occupied.flatMap((site) => {
      const offsetX = (site.width + footprint.width) / 2 + clearance
      const offsetZ = (site.depth + footprint.depth) / 2 + clearance
      return [
        { ...footprint, x: site.x - offsetX, z: site.z },
        { ...footprint, x: site.x + offsetX, z: site.z },
        { ...footprint, x: site.x, z: site.z - offsetZ },
        { ...footprint, x: site.x, z: site.z + offsetZ }
      ]
    })
  ]
  const gate = { x: 0, z: 0, width: WORLD_STREET_METRES, depth: WORLD_STREET_METRES }
  const isAvailable = (candidate: WorldFootprint) =>
    Math.abs(candidate.x) + candidate.width / 2 + WORLD_STREET_METRES <=
      WORLD_DOCUMENT_LIMITS.worldMetres &&
    Math.abs(candidate.z) + candidate.depth / 2 + WORLD_STREET_METRES <=
      WORLD_DOCUMENT_LIMITS.worldMetres &&
    !overlaps(candidate, gate) &&
    occupied.every((site) => !overlaps(candidate, site, clearance))
  const distance = (candidate: WorldFootprint) =>
    Math.hypot(candidate.x - footprint.x, candidate.z - footprint.z)
  const nearby = candidates
    .sort((first, second) => distance(first) - distance(second))
    .find(isAvailable)
  if (nearby) return { ...nearby }
  const pitch =
    Math.max(footprint.width, footprint.depth, WORLD_DOCUMENT_LIMITS.buildingMetres) + clearance
  const edge =
    WORLD_DOCUMENT_LIMITS.worldMetres -
    Math.max(footprint.width, footprint.depth) / 2 -
    WORLD_STREET_METRES
  for (let x = -edge; x <= edge; x += pitch)
    for (let z = -edge; z <= edge; z += pitch) {
      const candidate = { ...footprint, x, z }
      if (isAvailable(candidate)) return candidate
    }
  throw new RangeError('No free world footprint within the coordinate limits')
}

// dry-new: geometry checks footprints; explicit compaction needs deterministic district packing.
export function compactWorldDocument(document: WorldDocument): WorldDocument {
  const compacted = structuredClone(document)
  const buildingDistrict = packDistrict(compacted.buildings)
  const venueDistrict = packDistrict(compacted.venues)

  // The continuous central street leaves the origin gate open and connects every row's streets.
  for (const building of compacted.buildings) {
    building.footprint.x += WORLD_STREET_METRES / 2
    building.footprint.z -= buildingDistrict.depth / 2
  }
  for (const venue of compacted.venues) {
    venue.footprint.x -= venueDistrict.width + WORLD_STREET_METRES / 2
    venue.footprint.z -= venueDistrict.depth / 2
  }
  return compacted
}

function packDistrict(sites: readonly Pick<WorldBuilding, 'id' | 'footprint'>[]): WorldSize {
  const ordered = [...sites].sort((first, second) => {
    const sizeOrder =
      second.footprint.depth - first.footprint.depth ||
      second.footprint.width - first.footprint.width
    if (sizeOrder !== 0) return sizeOrder
    if (first.id === second.id) return 0
    return first.id < second.id ? -1 : 1
  })
  const paddedArea = ordered.reduce(
    (area, site) =>
      area +
      (site.footprint.width + WORLD_STREET_METRES) * (site.footprint.depth + WORLD_STREET_METRES),
    0
  )
  const targetWidth = Math.max(
    Math.sqrt(paddedArea),
    ...ordered.map((site) => site.footprint.width)
  )
  let rowX = 0
  let rowZ = 0
  let rowDepth = 0
  let districtWidth = 0
  for (const { footprint } of ordered) {
    if (rowX > 0 && rowX + footprint.width > targetWidth) {
      rowZ += rowDepth + WORLD_STREET_METRES
      rowX = 0
      rowDepth = 0
    }
    footprint.x = rowX + footprint.width / 2
    footprint.z = rowZ + footprint.depth / 2
    rowX += footprint.width + WORLD_STREET_METRES
    rowDepth = Math.max(rowDepth, footprint.depth)
    districtWidth = Math.max(districtWidth, rowX - WORLD_STREET_METRES)
  }
  return { width: districtWidth, depth: rowZ + rowDepth }
}
