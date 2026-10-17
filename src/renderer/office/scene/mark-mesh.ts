import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  type BufferAttribute,
  type BufferGeometry,
  type Color,
  type Material
} from 'three'
import type { MarkPose } from './city-marks'
import { HIDDEN_MATRIX } from './mesh-batches'

export interface DirtyRange {
  low: number
  high: number
}

export const cleanRange = (): DirtyRange => ({ low: Infinity, high: -1 })

// Writes one instance only where it changed, widening `range` over it.
export function writeChanged(
  attribute: BufferAttribute,
  values: ArrayLike<number>,
  index: number,
  range: DirtyRange
): void {
  const { array, itemSize } = attribute
  const offset = index * itemSize
  let isSame = true
  for (let element = 0; element < itemSize && isSame; element++)
    isSame = array[offset + element] === Math.fround(values[element])
  if (isSame) return
  for (let element = 0; element < itemSize; element++) array[offset + element] = values[element]
  range.low = Math.min(range.low, index)
  range.high = Math.max(range.high, index)
}

// Sends the frame's one dirty range, if any, and clears it.
export function flush(attribute: BufferAttribute, range: DirtyRange): void {
  if (range.high < range.low) return
  const size = attribute.itemSize
  attribute.addUpdateRange(range.low * size, (range.high - range.low + 1) * size)
  attribute.needsUpdate = true
  range.low = Infinity
  range.high = -1
}

export interface MarkMesh {
  mesh: InstancedMesh
  // Writes an instance only where it changed, so a still mark uploads nothing.
  put(index: number, pose: MarkPose, color: Color): void
  hide(index: number): void
  // Ends the frame: one dirty range per buffer, and no draw while nothing is shown.
  finish(count: number): void
  dispose(): void
}

const scratch = new Object3D()

// One instanced draw for a whole effect kind (N3), written in place each frame.
export function createMarkMesh(
  geometry: BufferGeometry,
  material: Material,
  capacity: number
): MarkMesh {
  const mesh = new InstancedMesh(geometry, material, capacity)
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  // Slots start hidden, not identity, so a first hide() sends nothing.
  for (let index = 0; index < capacity; index++) mesh.setMatrixAt(index, HIDDEN_MATRIX)
  const colors = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
  colors.setUsage(DynamicDrawUsage)
  mesh.instanceColor = colors
  // Instances roam the city; one stale bounding sphere would cull them all.
  mesh.frustumCulled = false
  // Marks take no pointer: a click goes through to the building.
  mesh.raycast = () => undefined
  mesh.count = 0
  mesh.visible = false
  const matrixRange = cleanRange()
  const colorRange = cleanRange()
  const rgb = [0, 0, 0]
  return {
    mesh,
    put(index, pose, color) {
      if (index >= capacity) return
      scratch.position.set(pose.x, pose.y, pose.z)
      scratch.rotation.set(pose.rotationX ?? 0, pose.rotationY ?? 0, 0)
      scratch.scale.set(pose.scaleX, pose.scaleY, pose.scaleZ)
      scratch.updateMatrix()
      writeChanged(mesh.instanceMatrix, scratch.matrix.elements, index, matrixRange)
      rgb[0] = color.r
      rgb[1] = color.g
      rgb[2] = color.b
      writeChanged(colors, rgb, index, colorRange)
    },
    hide(index) {
      if (index < capacity)
        writeChanged(mesh.instanceMatrix, HIDDEN_MATRIX.elements, index, matrixRange)
    },
    finish(count) {
      mesh.count = Math.min(count, capacity)
      mesh.visible = mesh.count > 0
      flush(mesh.instanceMatrix, matrixRange)
      flush(colors, colorRange)
    },
    dispose() {
      mesh.geometry.dispose()
      material.dispose()
      mesh.dispose()
    }
  }
}
