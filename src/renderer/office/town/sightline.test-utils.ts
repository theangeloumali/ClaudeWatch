import { ISO_POLAR, ISO_START_AZIMUTH } from '../logic/camera-bands'
import type { Rect } from '../themes/lot-math'

export interface SightBox extends Rect {
  // Metres above the ground the box stands on.
  height: number
}

interface GroundPoint {
  x: number
  z: number
  // Metres above the ground, for a sign or a roof rather than a doorstep.
  height?: number
}

// The four quarter turns the map snaps to (logic/camera-bands.ts).
export const MAP_ROTATIONS: readonly number[] = [0, 1, 2, 3].map(
  (quarter) => ISO_START_AZIMUTH + (quarter * Math.PI) / 2
)

// Metres the line of sight rises for each metre it runs toward the camera.
const SIGHT_RISE = 1 / Math.tan(ISO_POLAR)
const EDGE_EPSILON = 1e-9

// Where a line from `from`, running `step` for each metre, is between `min` and `max`.
function crossing(from: number, step: number, min: number, max: number): [number, number] {
  if (step === 0) return from > min && from < max ? [-Infinity, Infinity] : [Infinity, -Infinity]
  const near = (min - from) / step
  const far = (max - from) / step
  return [Math.min(near, far), Math.max(near, far)]
}

// A point is hidden when a box stands between it and the orthographic camera: the line of sight
// enters the box's footprint before it has risen over the box.
export function isHidden(point: GroundPoint, boxes: readonly SightBox[], azimuth: number): boolean {
  const toCamera = { x: Math.sin(azimuth), z: Math.cos(azimuth) }
  return boxes.some((box) => {
    const alongX = crossing(point.x, toCamera.x, box.x - box.width / 2, box.x + box.width / 2)
    const alongZ = crossing(point.z, toCamera.z, box.z - box.depth / 2, box.z + box.depth / 2)
    const enters = Math.max(alongX[0], alongZ[0], 0)
    const leaves = Math.min(alongX[1], alongZ[1])
    const rise = (point.height ?? 0) + enters * SIGHT_RISE
    return enters < leaves - EDGE_EPSILON && rise < box.height - EDGE_EPSILON
  })
}

// The part of the points in plain sight from one rotation; 1 when there are none.
export function plainSightShare(
  points: readonly GroundPoint[],
  boxes: readonly SightBox[],
  azimuth: number
): number {
  if (points.length === 0) return 1
  return points.filter((point) => !isHidden(point, boxes, azimuth)).length / points.length
}
