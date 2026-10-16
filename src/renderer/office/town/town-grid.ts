import type { QualityLevel } from '../logic/quality'
import type { Rect } from '../themes/lot-math'

// Two nested lattices, both pinned at the gate (the floor's origin), so nothing on them moves.
export const LOT_PITCH_M = 12
// A block is 2 x 2 lots; collectors run on these lines.
export const BLOCK_PITCH_M = 24

// Road widths now live with the shared street types; the lattice files still read them here.
export { ROAD_WIDTH_M, SIDEWALK_M } from '../../../shared/office/town-roads'
export const AVENUE_MEDIAN_M = 3
// The boulevard (10) plus at least 3 m of green between it and the plate.
export const MIN_BELT_M = 13
// A held edge comes back in only once the campus needs this much less: more than a desk column.
export const CLAIM_RELEASE_M = 18
export const FAR_RING_FROM_M = 24
export const LOT_SIDE_MAX_M = 8
export const CLAIM_SETBACK_M = 1

export const RING_M: Record<QualityLevel, number> = { full: 48, balanced: 48, light: 24 }
export const OLD_TOWN_BLOCKS: Record<QualityLevel, number> = { full: 3, balanced: 3, light: 2 }
export const BUILDING_CAP: Record<QualityLevel, number> = { full: 200, balanced: 140, light: 90 }

// How far the town reaches, the owner's choice; the detail level thins within it.
export const TOWN_SIZES = ['village', 'town', 'city'] as const
export type TownSize = (typeof TOWN_SIZES)[number]

// Village: the plaza, the market behind it and one block round the claim. City: the full town.
// No cap of its own: a lower one thins the old town's market away round a large campus.
export const TOWN_REACH: Record<TownSize, { ringM: number; oldTownBlocks: number }> = {
  village: { ringM: 24, oldTownBlocks: 2 },
  town: { ringM: 36, oldTownBlocks: 3 },
  city: { ringM: 48, oldTownBlocks: 3 }
}

// The square of a lattice whose north-west corner is (column, row) times the pitch.
export function cellRect(column: number, row: number, pitch: number): Rect {
  return { x: (column + 0.5) * pitch, z: (row + 0.5) * pitch, width: pitch, depth: pitch }
}

// Every line of a lattice from one edge to the other, both included.
export function latticeLines(from: number, to: number, pitch: number): number[] {
  const first = Math.ceil(from / pitch)
  const count = Math.floor(to / pitch) - first + 1
  // `+ 0` turns the -0 that `-1 * 0` would leave into 0, so plans compare equal.
  return Array.from({ length: Math.max(0, count) }, (_, index) => (first + index) * pitch + 0)
}
