import type { LoungeGeometry } from '../scene-model'
import { gapBetween, overlaps, type Rect } from './lot-math'

// A piece of furniture's footprint on the floor, centred at x and z.
export type Footprint = Rect

// Kept free around a seat and around the straight walk from the door to it.
const BODY_CLEAR_M = 0.55
const WALK_STEPS = 24
const WALL_GAP_M = 0.15

function isWalkable(lounge: LoungeGeometry, spot: Footprint): boolean {
  return lounge.seats.every((seat) =>
    Array.from({ length: WALK_STEPS + 1 }, (_, step) => step / WALK_STEPS).every(
      (share) =>
        gapBetween(spot, {
          x: lounge.door.x + (seat.x - lounge.door.x) * share,
          z: lounge.door.z + (seat.z - lounge.door.z) * share,
          width: 0,
          depth: 0
        }) >= BODY_CLEAR_M
    )
  )
}

// Where furniture of a given size may stand: against a wall or in a corner of the lounge, as
// shares of its width and depth (-1 west or north, 1 east or south).
export function spotAt(
  lounge: LoungeGeometry,
  across: number,
  along: number,
  width: number,
  depth: number
): Footprint {
  return {
    x: lounge.x + across * (lounge.width / 2 - width / 2 - WALL_GAP_M),
    z: lounge.z + along * (lounge.depth / 2 - depth / 2 - WALL_GAP_M),
    width,
    depth
  }
}

// The first spot no agent sits on or walks through, and nothing already placed stands on.
export function firstClear<Spot extends Footprint>(
  lounge: LoungeGeometry,
  spots: readonly Spot[],
  taken: readonly Footprint[] = []
): Spot | null {
  return (
    spots.find(
      (spot) => isWalkable(lounge, spot) && !taken.some((other) => overlaps(spot, other))
    ) ?? null
  )
}
