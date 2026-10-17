import { floorElevation, PHYSICAL_STOREY_HEIGHT } from '../scene/all-floor-model'
import type { FloorGeometry } from '../scene-model'
import { MAX_LOT_HEIGHT_M } from '../themes/surroundings'
import type { PlaceTop } from './building-place'
import { doorSide, SIDE_NORMAL } from './room-layout'

// Mast, jib, counter-jib and cable, then four scaffold posts and four rails.
export const BOXES_PER_RIG = 12
const SCAFFOLD_OUT_M = 0.8
const SCAFFOLD_ABOVE_M = 0.9
const CRANE_OUT_M = 2
const MAST_ABOVE_M = 3
// Shares of the hoist: lift to the hook, swing along the jib, set down, then sink in.
const LIFT_END = 0.35
const HOIST_END = 0.7
const SET_END = 0.8

export interface BoxPose {
  at: [number, number, number]
  size: [number, number, number]
  yaw: number
}

export interface RigSite {
  ground: FloorGeometry
  top: FloorGeometry
  spire: PlaceTop
}

const lerp = (from: number, to: number, share: number): number => from + (to - from) * share
const clamp01 = (share: number): number => Math.min(1, Math.max(0, share))
const upright = (at: BoxPose['at'], size: BoxPose['size']): BoxPose => ({ at, size, yaw: 0 })

// The rig's boxes and the hoisted module at `progress` (0–1) through the hoist.
export function rigPose(
  { ground, top, spire }: RigSite,
  progress: number,
  module: BoxPose['size']
): { boxes: (BoxPose | null)[]; module: BoxPose } {
  const door = ground.entrance ?? { x: ground.x, z: ground.z + ground.depth / 2 }
  // Agents walk in through the entrance, so the crane stands behind the building.
  const front = SIDE_NORMAL[doorSide({ ...ground, door })]
  const reach = Math.abs(front.x) * top.width + Math.abs(front.z) * top.depth
  const across = Math.abs(front.z) * top.width + Math.abs(front.x) * top.depth
  const footX = top.x - front.x * (reach / 2 + CRANE_OUT_M) + front.z * across * 0.3
  const footZ = top.z - front.z * (reach / 2 + CRANE_OUT_M) - front.x * across * 0.3
  const mastTop = Math.min(MAX_LOT_HEIGHT_M, spire.y + MAST_ABOVE_M)
  const toSpire = Math.hypot(spire.x - footX, spire.z - footZ)
  const [alongX, alongZ] = [(spire.x - footX) / toSpire, (spire.z - footZ) / toSpire]
  const yaw = Math.atan2(alongX, alongZ)
  const jibM = toSpire + 1.5
  const onJib = (share: number): [number, number, number] => [
    footX + alongX * jibM * share,
    mastTop,
    footZ + alongZ * jibM * share
  ]
  const hookY = mastTop - 0.15
  const [width, height, depth] = module
  const [pickupX, pickupZ] = [footX + alongX * 1.5, footZ + alongZ * 1.5]
  const travel = clamp01((progress - LIFT_END) / (HOIST_END - LIFT_END))
  const y =
    progress < HOIST_END
      ? lerp(height / 2, hookY - 1, clamp01(progress / LIFT_END))
      : lerp(
          hookY - 1,
          spire.y + height / 2,
          clamp01((progress - HOIST_END) / (SET_END - HOIST_END))
        )
  const x = lerp(pickupX, spire.x, travel)
  const z = lerp(pickupZ, spire.z, travel)
  const sink = progress < SET_END ? 1 : 1 - (progress - SET_END) / (1 - SET_END)
  const cableM = hookY - (y + height / 2)
  const base = floorElevation(top)
  const railY = base + PHYSICAL_STOREY_HEIGHT + SCAFFOLD_ABOVE_M
  const outWidth = top.width + 2 * SCAFFOLD_OUT_M
  const outDepth = top.depth + 2 * SCAFFOLD_OUT_M
  const posts = [-1, 1].flatMap((sideX) =>
    [-1, 1].map((sideZ) =>
      upright(
        [top.x + (sideX * outWidth) / 2, (base + railY) / 2, top.z + (sideZ * outDepth) / 2],
        [0.2, railY - base, 0.2]
      )
    )
  )
  const rails = [-1, 1].flatMap((side) => [
    upright([top.x, railY, top.z + (side * outDepth) / 2], [outWidth, 0.15, 0.15]),
    upright([top.x + (side * outWidth) / 2, railY, top.z], [0.15, 0.15, outDepth])
  ])
  return {
    boxes: [
      upright([footX, mastTop / 2, footZ], [0.5, mastTop, 0.5]),
      { at: onJib(0.5), size: [0.3, 0.3, jibM], yaw },
      { at: onJib(-0.17), size: [0.4, 0.4, jibM * 0.35], yaw },
      progress < SET_END && cableM > 0
        ? upright([x, y + height / 2 + cableM / 2, z], [0.06, cableM, 0.06])
        : null,
      ...posts,
      ...rails
    ],
    module: upright([x, y, z], [width, height * sink, depth])
  }
}
