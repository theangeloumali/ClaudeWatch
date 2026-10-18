// Sitting down or standing up: inside the 150-200 ms brief and the 300 ms ceiling for UI motion.
export const SEAT_EASE_SEC = 0.18

// A figure's ease between standing (0) and seated (1); null until its first frame is drawn.
export interface SeatEase {
  seatedness: number | null
  // Body height on the seat it last sat in: a stand-up eases up from there.
  seatedY: number
}

export const createSeatEase = (): SeatEase => ({ seatedness: null, seatedY: 0 })

const easeOutCubic = (progress: number): number => 1 - (1 - progress) ** 3
const easeOutCubicInverse = (eased: number): number => 1 - Math.cbrt(1 - eased)

// Ease-out either way. The share already moved is read back as time on a fresh ease, so a figure
// that turns back mid-ease carries on from where it is.
export function seatednessAfter(
  seatedness: number,
  isSeated: boolean,
  deltaSec: number,
  isReducedMotion: boolean
): number {
  const target = isSeated ? 1 : 0
  if (isReducedMotion || seatedness === target) return target
  const moved = isSeated ? seatedness : 1 - seatedness
  const progress = Math.min(1, easeOutCubicInverse(moved) + deltaSec / SEAT_EASE_SEC)
  const eased = easeOutCubic(progress)
  return isSeated ? eased : 1 - eased
}

// One frame of a figure's ease, mutated in place. A first frame, or one without an ease to
// carry, is drawn as posed.
export function advanceSeat(
  seat: SeatEase | undefined,
  isSeated: boolean,
  seatedY: number,
  frame: { delta: number; isReducedMotion: boolean }
): number {
  const target = isSeated ? 1 : 0
  if (!seat) return target
  if (isSeated) seat.seatedY = seatedY
  seat.seatedness =
    seat.seatedness === null
      ? target
      : seatednessAfter(seat.seatedness, isSeated, frame.delta, frame.isReducedMotion)
  return seat.seatedness
}
