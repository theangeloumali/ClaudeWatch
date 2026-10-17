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
import { cityEvents, type CityEvent } from '../../office-live/city-events'
import { buildingPlace, type PlaceTop } from '../logic/building-place'
import type { ZoomBand } from '../logic/camera-bands'
import { cityClock } from '../logic/city-clock'
import { citySignalStore } from '../logic/city-signal-store'
import type { BuildingSignal, CitySignals } from '../logic/city-signals'
import { levelInUse, type QualityLevel } from '../logic/quality'
import { useQualityChoice } from '../quality-store'
import { MAX_LOT_HEIGHT_M } from '../themes/surroundings'

// What every city mark reads in one drawn frame: the live signals, events and roofs.
export interface CityMarkFrame {
  signals: CitySignals
  events: readonly CityEvent[]
  topOf: (buildingId: string) => PlaceTop | null
  nowMs: number
  isPinned: boolean
  // Orthographic pixels per metre: a mark's size on screen follows it (N7).
  zoom: number
  band: ZoomBand
}

// Reduced motion pins the city clock, so events still live and end on the wall clock.
export function readCityMarks(band: ZoomBand, zoom: number): CityMarkFrame {
  const nowMs = cityClock.now()
  const isPinned = cityClock.isPinned()
  return {
    signals: citySignalStore.current(),
    events: cityEvents.active(isPinned ? Date.now() : nowMs),
    topOf: (buildingId) => buildingPlace(buildingId).topAt(nowMs, isPinned),
    nowMs,
    isPinned,
    zoom,
    band
  }
}

// Effects go first when the machine struggles; the state still shows on cards and gems.
export const isMarkLevel = (level: QualityLevel): boolean => level !== 'light'

export function useMarkLevel(): QualityLevel {
  const { pin, chosen } = useQualityChoice()
  return levelInUse(pin, chosen)
}

// The scene box always holds the 24 m height rule; a mark above a roof stops there, or Horizon
// would clip it (N5).
export const markCeiling = (top: PlaceTop): number => Math.max(top.y, MAX_LOT_HEIGHT_M)

export const screenMetres = (pixels: number, zoom: number): number => pixels / Math.max(zoom, 0.1)

// The buildings whose signal holds, in a stable order, at most `limit` of them.
export function markSites(
  signals: CitySignals,
  holds: (signal: BuildingSignal) => boolean,
  limit: number
): string[] {
  const sites: string[] = []
  for (const [buildingId, signal] of signals.buildings) if (holds(signal)) sites.push(buildingId)
  return sites.sort().slice(0, limit)
}

export interface MarkPose {
  x: number
  y: number
  z: number
  scaleX: number
  scaleY: number
  scaleZ: number
  rotationX?: number
  rotationY?: number
}

export interface MarkMesh {
  mesh: InstancedMesh
  // Writes an instance only where it changed, so a still mark uploads nothing.
  put(index: number, pose: MarkPose, color: Color): void
  // Ends the frame: one dirty range per buffer, and no draw while nothing is shown.
  finish(count: number): void
  dispose(): void
}

interface DirtyRange {
  low: number
  high: number
}

const scratch = new Object3D()

function writeChanged(
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

function flush(attribute: BufferAttribute, range: DirtyRange): void {
  if (range.high < range.low) return
  const size = attribute.itemSize
  attribute.addUpdateRange(range.low * size, (range.high - range.low + 1) * size)
  attribute.needsUpdate = true
  range.low = Infinity
  range.high = -1
}

// One instanced draw for a whole effect kind (N3), written in place each frame.
export function createMarkMesh(
  geometry: BufferGeometry,
  material: Material,
  capacity: number
): MarkMesh {
  const mesh = new InstancedMesh(geometry, material, capacity)
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  const colors = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
  colors.setUsage(DynamicDrawUsage)
  mesh.instanceColor = colors
  // Instances roam the city; one stale bounding sphere would cull them all.
  mesh.frustumCulled = false
  mesh.count = 0
  mesh.visible = false
  const matrixRange: DirtyRange = { low: Infinity, high: -1 }
  const colorRange: DirtyRange = { low: Infinity, high: -1 }
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
