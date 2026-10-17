import {
  Group,
  InstancedMesh,
  InterleavedBufferAttribute,
  Mesh,
  type BufferAttribute,
  type InterleavedBuffer,
  type Object3D
} from 'three'
import type { QualityLevel } from '../logic/quality'
import { createMeshBatches, updateMeshBatches, type MeshBatch } from '../scene/mesh-batches'

export type CityLayer =
  | 'signs'
  | 'venue-landmarks'
  | 'railway'
  | 'trains'
  | 'work-trips'
  | 'spires'
  | 'rig'
  | 'crowns'
  | 'beacons'
  | 'particles'
  | 'flags'
  | 'company-lens'

interface LayerAllocation {
  draws: Record<QualityLevel, number>
  // On a frame where nothing the layer draws moved; trains never stand still.
  uploadBytes: number
  // Drawn for a moment only: counted at the peak, not in the steady sum.
  isTransient?: boolean
}

const perLevel = (full: number, balanced: number, light: number): Record<QualityLevel, number> => ({
  full,
  balanced,
  light
})

// What each port layer may add over the Phase 0 baseline. Lighter levels keep what shows state:
// signs, the viaduct and the spires.
export const CITY_LAYER_BUDGET: Record<CityLayer, LayerAllocation> = {
  signs: { draws: perLevel(2, 2, 2), uploadBytes: 0 },
  'venue-landmarks': { draws: perLevel(1, 0, 0), uploadBytes: 0 },
  railway: { draws: perLevel(4, 2, 1), uploadBytes: 0 },
  // Drawn under railway; their poses are the city's one upload while still.
  trains: { draws: perLevel(0, 0, 0), uploadBytes: 2048 },
  // A ring lives only while a trip is under way, as the rig only while a stage rises.
  'work-trips': { draws: perLevel(1, 0, 0), uploadBytes: 0, isTransient: true },
  spires: { draws: perLevel(1, 1, 1), uploadBytes: 0 },
  rig: { draws: perLevel(2, 2, 0), uploadBytes: 0, isTransient: true },
  crowns: { draws: perLevel(1, 0, 0), uploadBytes: 0 },
  beacons: { draws: perLevel(1, 1, 0), uploadBytes: 0 },
  particles: { draws: perLevel(1, 1, 0), uploadBytes: 0 },
  flags: { draws: perLevel(1, 1, 0), uploadBytes: 0 },
  // Re-tints what is already drawn (A5).
  'company-lens': { draws: perLevel(0, 0, 0), uploadBytes: 0 }
}

interface LayerFrame {
  draws: number
  triangles: number
  uploadBytes: number
}

type GpuBuffer = BufferAttribute | InterleavedBuffer

// Kept between frames, as a layer's BatchedScene keeps its batches.
const layerBatches = new WeakMap<Object3D, MeshBatch[]>()
// The version of each buffer the GPU holds, as three.js's WebGLAttributes tracks it.
const sentVersions = new WeakMap<GpuBuffer, number>()

function batchFrame(scene: Object3D): void {
  if (!(scene instanceof Group)) return
  const batches = layerBatches.get(scene)
  if (batches) updateMeshBatches(scene, batches)
  else layerBatches.set(scene, createMeshBatches(scene))
}

// The rule mergedDraws counts by (scene.test-utils): one draw per mesh on the camera layer with
// one visible material. An upper bound, since a hidden object still counts.
function drawnMeshes(root: Object3D): Mesh[] {
  const meshes: Mesh[] = []
  root.traverse((object) => {
    if (!(object instanceof Mesh) || !object.layers.isEnabled(0)) return
    if (Array.isArray(object.material) || !object.material.visible) return
    meshes.push(object)
  })
  return meshes
}

function trianglesOf(mesh: Mesh): number {
  const { index, attributes } = mesh.geometry
  return (
    ((index?.count ?? attributes.position.count) / 3) *
    (mesh instanceof InstancedMesh ? mesh.count : 1)
  )
}

function buffersOf(mesh: Mesh): GpuBuffer[] {
  const { index, attributes } = mesh.geometry
  const drawn = [...Object.values(attributes), ...(index ? [index] : [])]
  if (mesh instanceof InstancedMesh)
    drawn.push(mesh.instanceMatrix, ...(mesh.instanceColor ? [mesh.instanceColor] : []))
  return drawn.map((attribute) =>
    attribute instanceof InterleavedBufferAttribute ? attribute.data : attribute
  )
}

// Ranges that overlap or sit one element apart go up as one, as three.js merges them.
function mergedCount(ranges: readonly { start: number; count: number }[]): number {
  const [first, ...rest] = [...ranges].sort((a, b) => a.start - b.start)
  let merged = { ...first }
  let total = 0
  for (const range of rest) {
    if (range.start <= merged.start + merged.count + 1)
      merged.count = Math.max(merged.count, range.start + range.count - merged.start)
    else {
      total += merged.count
      merged = { ...range }
    }
  }
  return total + merged.count
}

// A new buffer goes up whole; a changed one as its dirty ranges, or whole when it names none.
function sendBuffer(buffer: GpuBuffer): number {
  const sent = sentVersions.get(buffer)
  if (sent !== undefined && sent >= buffer.version) return 0
  sentVersions.set(buffer, buffer.version)
  if (sent === undefined || buffer.updateRanges.length === 0) return buffer.array.byteLength
  const bytes = mergedCount(buffer.updateRanges) * buffer.array.BYTES_PER_ELEMENT
  buffer.clearUpdateRanges()
  return bytes
}

// One drawn frame of a layer, batched as its BatchedScene draws it: call it again for the next.
export function measureLayer(scene: Object3D): LayerFrame {
  batchFrame(scene)
  const meshes = drawnMeshes(scene)
  return {
    draws: meshes.length,
    triangles: meshes.reduce((sum, mesh) => sum + trianglesOf(mesh), 0),
    uploadBytes: meshes.flatMap(buffersOf).reduce((sum, buffer) => sum + sendBuffer(buffer), 0)
  }
}
