import type { CampusSpoke } from './campus-geometry'

export interface CampusRoomColors {
  slab: string
  rug: string
  wall: string
  chip: string
}

// Saturated room colours on the dark campus; the rug and wall are lighter and darker steps of the slab.
const CAMPUS_ROOM_PALETTE: readonly CampusRoomColors[] = [
  { slab: '#3FA65B', rug: '#C9EBCF', wall: '#2E7F45', chip: '#34C759' },
  { slab: '#E08A3C', rug: '#F6DDC2', wall: '#B86A26', chip: '#FF9F0A' },
  { slab: '#3C6FD8', rug: '#C8D7F6', wall: '#2B54AE', chip: '#0A84FF' },
  { slab: '#E3B23C', rug: '#F6E7BE', wall: '#B88C24', chip: '#FFD60A' },
  { slab: '#C24FC9', rug: '#EFC9F1', wall: '#963A9C', chip: '#E040FB' },
  { slab: '#D94A4A', rug: '#F4C6C6', wall: '#AE3434', chip: '#FF453A' },
  { slab: '#6E5BD8', rug: '#D4CDF6', wall: '#5242AE', chip: '#7D6BFF' },
  { slab: '#2FA59B', rug: '#C3EAE6', wall: '#227E76', chip: '#30D5C8' }
]

// Colours follow the ring's angular order, so neighbouring rooms differ until the palette wraps.
export function campusRoomColors(spokes: readonly CampusSpoke[]): Map<string, CampusRoomColors> {
  const byAngle = spokes
    .filter((spoke): spoke is CampusSpoke & { projectKey: string } => spoke.projectKey !== null)
    .toSorted(
      (first, second) =>
        Math.atan2(first.from.z, first.from.x) - Math.atan2(second.from.z, second.from.x) ||
        first.projectKey.localeCompare(second.projectKey)
    )
  const colors = new Map<string, CampusRoomColors>()
  for (const spoke of byAngle) {
    if (!colors.has(spoke.projectKey))
      colors.set(spoke.projectKey, CAMPUS_ROOM_PALETTE[colors.size % CAMPUS_ROOM_PALETTE.length])
  }
  return colors
}
