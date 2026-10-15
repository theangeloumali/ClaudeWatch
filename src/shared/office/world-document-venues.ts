import { overlaps } from './world-document-geometry'
import type { WorldBuilding, WorldVenue } from './world-document-types'

export function defaultWorldVenues(
  buildings: readonly WorldBuilding[],
  pitch: number
): WorldVenue[] {
  if (!buildings.length) return []
  const kinds: WorldVenue['kind'][] = ['arcade', 'lounge', 'market', 'garage', 'transit']
  const names = ['Arcade', 'Lounge', 'Night market', 'Motor garage', 'Transit hub']
  const venues: WorldVenue[] = []
  const corners = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
    [2, 1]
  ]
  for (const [index, kind] of kinds.entries()) {
    const [directionX, directionZ] = corners[index]
    for (let ring = 1; ring <= 8; ring++) {
      const footprint = {
        x: directionX * pitch * ring,
        z: directionZ * pitch * ring,
        width: 12,
        depth: 10
      }
      if (
        [
          ...buildings.map((building) => building.footprint),
          ...venues.map((venue) => venue.footprint)
        ].some((occupied) => overlaps(occupied, footprint, 3))
      )
        continue
      venues.push({
        id: `venue:${kind}`,
        kind,
        displayName: names[index],
        footprint,
        entrance: { x: 0, z: -5 },
        capacity: 3,
        slots: [-3, 0, 3].map((x, slot) => ({ id: `venue-seat:${slot}`, x, z: 0, heading: 0 }))
      })
      break
    }
  }
  return venues
}
