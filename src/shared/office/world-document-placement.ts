import { compactWorldDocument } from './world-document-packing'
import { CITY_FRONTAGE_SETBACK_METRES, cityBlock, cityGrid } from './city-block-layout'
import { WORLD_DOCUMENT_LIMITS } from './world-document-limits'
import type { WorldDocument } from './world-document-types'

// Independent office IDs occupy street parcels; company membership never determines geography.
export function arrangeWorldDocument(
  document: WorldDocument,
  mode: 'central' | 'districts' | 'streets' = 'streets'
): WorldDocument {
  if (mode === 'central') return compactWorldDocument(document)
  const arranged = structuredClone(document)
  const sites = [
    ...arranged.buildings.toSorted(
      (first, second) =>
        first.projectKey.localeCompare(second.projectKey) || first.id.localeCompare(second.id)
    ),
    ...arranged.venues
  ]
  if (!sites.length) return arranged
  const grid = cityGrid(sites.map((site) => site.footprint))
  const columns = Math.max(2, Math.ceil(Math.sqrt(sites.length)))
  const rows = Math.max(2, Math.ceil(sites.length / columns))
  const blocks = Array.from({ length: columns * rows }, (_, index) =>
    cityBlock(
      grid,
      (index % columns) - Math.ceil(columns / 2),
      Math.floor(index / columns) - Math.ceil(rows / 2)
    )
  ).sort(
    (first, second) =>
      Math.hypot(first.x, first.z) - Math.hypot(second.x, second.z) ||
      first.row - second.row ||
      first.column - second.column
  )
  for (const [index, site] of sites.entries()) {
    const block = blocks[index]
    if (!block) throw new RangeError('No city parcel available for this office.')
    const x = block.x
    const z = block.z - block.depth / 2 + site.footprint.depth / 2 + CITY_FRONTAGE_SETBACK_METRES
    if (
      Math.abs(x) + site.footprint.width / 2 > WORLD_DOCUMENT_LIMITS.worldMetres ||
      Math.abs(z) + site.footprint.depth / 2 > WORLD_DOCUMENT_LIMITS.worldMetres
    )
      throw new RangeError('City arrangement exceeds the coordinate limits.')
    site.footprint.x = x
    site.footprint.z = z
  }
  return arranged
}
