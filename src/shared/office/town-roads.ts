import type { WorldPoint } from './world-document-types'

// Kerb to kerb, and each sidewalk inside that, for a road drawn by class alone.
export const ROAD_WIDTH_M = { avenue: 12, boulevard: 10, collector: 6, lane: 2 } as const
export const SIDEWALK_M = { avenue: 1.5, boulevard: 1.5, collector: 1, lane: 0 } as const

export type RoadClass = keyof typeof ROAD_WIDTH_M

export interface TownRoad {
  // The campus lattice: `road:x:${line}`, `boulevard:${side}` or `avenue`. The city:
  // `city-street:${n}` and `city-access:${x}:${z}:${n}`.
  id: string
  class: RoadClass
  // Axis-aligned centre line.
  from: WorldPoint
  to: WorldPoint
  width: number
}
