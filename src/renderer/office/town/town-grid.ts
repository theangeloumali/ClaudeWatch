// The lattice the claim snaps to, pinned at the gate (the floor's origin), so nothing on it moves.
export const LOT_PITCH_M = 12

// Road widths now live with the shared street types; the town files still read them here.
export { ROAD_WIDTH_M, SIDEWALK_M } from '../../../shared/office/town-roads'
// The margin the claim keeps round the plate. Stored claims were snapped with it: keep 13 m.
export const MIN_BELT_M = 13
// A held edge comes back in only once the plate needs this much less: more than a desk column.
export const CLAIM_RELEASE_M = 18

// How far the town reaches, the owner's choice; the detail level thins within it.
export const TOWN_SIZES = ['village', 'town', 'city'] as const
export type TownSize = (typeof TOWN_SIZES)[number]
