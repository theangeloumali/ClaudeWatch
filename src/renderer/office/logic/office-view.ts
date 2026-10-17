import { screenAxes } from './zone-framing'

// Where the camera looks: written by the camera rig, read by the mini-map outside React.
export interface OfficeView {
  x: number
  y: number
  z: number
  zoom: number
  azimuth: number
  polar: number
  width: number
  height: number
}

export interface MapPoint {
  x: number
  z: number
}

export interface ViewStore {
  write(view: OfficeView): void
  read(): OfficeView | null
  // Moves only on a change the map could show, so a still camera wakes no reader.
  version(): number
}

const MOVE_EPSILON_M = 0.1
const TURN_EPSILON_RAD = 0.002
const ZOOM_EPSILON = 0.005

function isVisibleChange(from: OfficeView, to: OfficeView): boolean {
  return (
    Math.hypot(to.x - from.x, to.z - from.z) > MOVE_EPSILON_M ||
    Math.abs(to.y - from.y) > MOVE_EPSILON_M ||
    Math.abs(to.azimuth - from.azimuth) > TURN_EPSILON_RAD ||
    Math.abs(to.polar - from.polar) > TURN_EPSILON_RAD ||
    Math.abs(to.zoom / from.zoom - 1) > ZOOM_EPSILON ||
    to.width !== from.width ||
    to.height !== from.height
  )
}

function createViewStore(): ViewStore {
  let shown: OfficeView | null = null
  let changes = 0
  return {
    // The writer may reuse its object each frame, so a published view is a copy.
    write(view) {
      if (shown && !isVisibleChange(shown, view)) return
      shown = { ...view }
      changes++
    },
    read: () => shown,
    version: () => changes
  }
}

// The page's camera view, a module store like `officePoses`.
export const officeView = createViewStore()

// The ground the orthographic view covers: each viewport corner, carried along the camera's
// line of sight onto the target's level. Top-left first, clockwise.
export function viewFootprint(view: OfficeView): MapPoint[] {
  const { right, up } = screenAxes(view.azimuth, view.polar)
  const halfWidth = view.width / 2 / view.zoom
  const halfHeight = view.height / 2 / view.zoom
  // The camera looks down this way; the polar clamp keeps its rise off zero.
  const sight = [
    -Math.sin(view.polar) * Math.sin(view.azimuth),
    -Math.cos(view.polar),
    -Math.sin(view.polar) * Math.cos(view.azimuth)
  ]
  return [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1]
  ].map(([across, along]) => {
    const offset = right.map(
      (value, axis) => value * across * halfWidth + up[axis] * along * halfHeight
    )
    const reach = offset[1] / -sight[1]
    return { x: view.x + offset[0] + sight[0] * reach, z: view.z + offset[2] + sight[2] * reach }
  })
}
