import { floorElevation, PHYSICAL_STOREY_HEIGHT } from '../scene/all-floor-model'
import type { MarkPose } from '../scene/city-marks'
import type { FloorGeometry } from '../scene-model'
import type { PlaceTop } from './building-place'
import { doorSide, SIDE_NORMAL } from './room-layout'

// Mast, jib, counter-jib and hoist line, then four scaffold posts and four rails.
export const BOXES_PER_RIG = 12
const SCAFFOLD_OUT_M = 0.8
const SCAFFOLD_ABOVE_M = 0.9
const CRANE_OUT_M = 2
// The jib clears the module's 3 m drop onto its 0.8 m seat, well inside MARK_RISE_M.
const MAST_ABOVE_M = 4
const JIB_M = 0.3

export interface RigSite {
  ground: FloorGeometry
  top: FloorGeometry
  spire: PlaceTop
}

const upright = (
  [x, y, z]: [number, number, number],
  [scaleX, scaleY, scaleZ]: [number, number, number]
): MarkPose => ({ x, y, z, scaleX, scaleY, scaleZ })

// The rig stands still for the whole hoist; the module itself rides the particle mesh.
export function rigPose({ ground, top, spire }: RigSite, lineEndY: number): MarkPose[] {
  const door = ground.entrance ?? { x: ground.x, z: ground.z + ground.depth / 2 }
  // Agents walk in through the entrance, so the crane stands behind the building.
  const front = SIDE_NORMAL[doorSide({ ...ground, door })]
  const reach = Math.abs(front.x) * top.width + Math.abs(front.z) * top.depth
  const across = Math.abs(front.z) * top.width + Math.abs(front.x) * top.depth
  const footX = top.x - front.x * (reach / 2 + CRANE_OUT_M) + front.z * across * 0.3
  const footZ = top.z - front.z * (reach / 2 + CRANE_OUT_M) - front.x * across * 0.3
  const mastTop = spire.y + MAST_ABOVE_M
  const toSpire = Math.hypot(spire.x - footX, spire.z - footZ)
  const [alongX, alongZ] = [(spire.x - footX) / toSpire, (spire.z - footZ) / toSpire]
  const rotationY = Math.atan2(alongX, alongZ)
  const jibM = toSpire + 1.5
  const onJib = (share: number, [scaleX, scaleY, scaleZ]: [number, number, number]) => ({
    x: footX + alongX * jibM * share,
    y: mastTop,
    z: footZ + alongZ * jibM * share,
    scaleX,
    scaleY,
    scaleZ,
    rotationY
  })
  const hookY = mastTop - JIB_M / 2
  const lineM = Math.max(0, hookY - lineEndY)
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
  return [
    upright([footX, mastTop / 2, footZ], [0.5, mastTop, 0.5]),
    onJib(0.5, [JIB_M, JIB_M, jibM]),
    onJib(-0.17, [0.4, 0.4, jibM * 0.35]),
    upright([spire.x, lineEndY + lineM / 2, spire.z], [0.06, lineM, 0.06]),
    ...posts,
    ...rails
  ]
}
