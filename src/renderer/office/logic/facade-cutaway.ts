// flicker-2: half-width of the hold band, ≈ ±4.6° either side of a view running along a wall.
const HOLD_BAND = 0.08

interface Horizontal {
  readonly x: number
  readonly z: number
}

// Whether a side is cut away. `forwardDotNormal` is the horizontal view direction · the side's
// inward normal, so it is positive while the camera sees that side's outer face. Inside the band
// the side keeps its state; on mount (`null`) it starts from the sign.
export function facadeSideOpen(forwardDotNormal: number, wasOpen: boolean | null): boolean {
  if (forwardDotNormal > HOLD_BAND) return true
  if (forwardDotNormal < -HOLD_BAND) return false
  return wasOpen ?? forwardDotNormal > 0
}

// Per-side cutaway state for one component. The view direction, unlike the camera position,
// ignores pans and Horizon's pushBack, and an orthographic view depends on nothing else.
export function createSideCutaway<Side extends string>() {
  const opened = new Map<Side, boolean>()
  return {
    isOpen(side: Side, forward: Horizontal, outwardNormal: Horizontal): boolean {
      const length = Math.hypot(forward.x, forward.z)
      const intoSide =
        length > 0 ? -(forward.x * outwardNormal.x + forward.z * outwardNormal.z) / length : 0
      const isOpen = facadeSideOpen(intoSide, opened.get(side) ?? null)
      opened.set(side, isOpen)
      return isOpen
    }
  }
}
