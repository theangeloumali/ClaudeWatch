import { BufferAttribute, BufferGeometry } from 'three'
import furnitureGlb from '../../assets/campus/campus-furniture.glb?inline'
import personGlb from '../../assets/campus/campus-person.glb?inline'
import { DESK_REACH } from '../../logic/room-layout'
import { topOf } from '../parts'
import type { Vector } from '../primitives'
import { WORKSTATIONS } from '../workstations'
import { SOFA_COLOR } from './palette'
import type { PropKind } from './room-parts'
import { BOOKSHELF, FLOOR_LAMP, PLANT, SOFA } from './room-props'

// A baked part's geometry. `parameters` makes toJSON a short key, so BatchedScene merges every
// copy of one kind, across all rooms and agents, into a single draw.
export class BakedGeometry extends BufferGeometry {
  override readonly type: string = 'BakedGeometry'
  readonly parameters: { bakedProp: string }

  constructor(bakedProp: string) {
    super()
    this.parameters = { bakedProp }
  }
}

export interface BakedPart {
  geometry: BakedGeometry
  // Where the part's node stands in its model; the geometry is drawn round it.
  pivot: Vector
  size: Vector
}

export interface CampusModels {
  furniture: ReadonlyMap<string, BakedPart>
  person: ReadonlyMap<string, BakedPart>
}

interface GltfAccessor {
  bufferView: number
  byteOffset?: number
  componentType: number
  count: number
  type: string
}
interface GltfJson {
  nodes: { name: string; mesh?: number; translation?: Vector }[]
  meshes: { primitives: { attributes: Record<string, number>; indices: number }[] }[]
  accessors: GltfAccessor[]
  bufferViews: { byteOffset?: number; byteStride?: number }[]
}

const GLB_MAGIC = 0x46546c67
const GLB_HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8
const FLOAT = 5126
const UNSIGNED_SHORT = 5123
const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC3: 3 }
const VERTEX_ATTRIBUTES = [
  ['position', 'POSITION'],
  ['normal', 'NORMAL'],
  ['color', 'COLOR_0']
] as const

function isGltfJson(value: unknown): value is GltfJson {
  if (typeof value !== 'object' || value === null) return false
  return ['nodes', 'meshes', 'accessors', 'bufferViews'].every((key) =>
    Array.isArray(Reflect.get(value, key))
  )
}

// Reads one float or u16 accessor, interleaved or not, from the binary chunk; null otherwise.
function readAccessor(json: GltfJson, data: DataView, binStart: number, index: number) {
  const accessor = json.accessors[index]
  const isFloat = accessor.componentType === FLOAT
  if (!isFloat && accessor.componentType !== UNSIGNED_SHORT) return null
  const view = json.bufferViews[accessor.bufferView]
  const components = COMPONENTS[accessor.type]
  const bytes = isFloat ? 4 : 2
  const stride = view.byteStride ?? components * bytes
  const start = binStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const length = accessor.count * components
  const values = isFloat ? new Float32Array(length) : new Uint16Array(length)
  for (let item = 0; item < accessor.count; item++)
    for (let component = 0; component < components; component++) {
      const at = start + item * stride + component * bytes
      values[item * components + component] = isFloat
        ? data.getFloat32(at, true)
        : data.getUint16(at, true)
    }
  return new BufferAttribute(values, components)
}

function decodePart(json: GltfJson, data: DataView, binStart: number, mesh: number, key: string) {
  const primitive = json.meshes[mesh].primitives[0]
  const geometry = new BakedGeometry(key)
  for (const [name, attribute] of VERTEX_ATTRIBUTES) {
    const read = readAccessor(json, data, binStart, primitive.attributes[attribute])
    if (!read) return null
    geometry.setAttribute(name, read)
  }
  const indices = readAccessor(json, data, binStart, primitive.indices)
  if (!indices) return null
  geometry.setIndex(indices)
  geometry.computeBoundingBox()
  return geometry
}

// Decodes a GLB this theme baked: one node per part, POSITION/NORMAL/COLOR_0 and u16 indices.
export function decodeBakedGlb(buffer: ArrayBuffer, prefix: string): Map<string, BakedPart> | null {
  const data = new DataView(buffer)
  if (buffer.byteLength < GLB_HEADER_BYTES || data.getUint32(0, true) !== GLB_MAGIC) return null
  const jsonLength = data.getUint32(GLB_HEADER_BYTES, true)
  const jsonStart = GLB_HEADER_BYTES + CHUNK_HEADER_BYTES
  const parsed: unknown = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, jsonStart, jsonLength))
  )
  if (!isGltfJson(parsed)) return null
  const binStart = jsonStart + jsonLength + CHUNK_HEADER_BYTES
  const parts = new Map<string, BakedPart>()
  for (const node of parsed.nodes) {
    if (node.mesh === undefined) continue
    const geometry = decodePart(parsed, data, binStart, node.mesh, `${prefix}:${node.name}`)
    const box = geometry?.boundingBox
    if (!geometry || !box) return null
    const size: Vector = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z]
    parts.set(node.name, { geometry, pivot: node.translation ?? [0, 0, 0], size })
  }
  return parts
}

function bytesOf(dataUrl: string): ArrayBuffer {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes.buffer
}

// Inlined and decoded at import, so the meshes exist when the scene first batches them:
// an async load would mount them after the batch was built, one draw each.
function loadCampusModels(): CampusModels | null {
  try {
    const furniture = decodeBakedGlb(bytesOf(furnitureGlb), 'campus-furniture')
    const person = decodeBakedGlb(bytesOf(personGlb), 'campus-person')
    if (furniture && person) return { furniture, person }
    console.warn('Campus models are not baked GLBs; drawing the built-in furniture.')
  } catch (error) {
    console.warn('Campus models failed to load; drawing the built-in furniture.', error)
  }
  return null
}

export const CAMPUS_MODELS = loadCampusModels()

// Box a part fills: `at` is its floor centre, `size` its extent once turned by `yaw`.
export interface FitBox {
  at: Vector
  size: Vector
  yaw?: number
}

// The baked geometry is centred on x and z and stands on y = 0, so a scale and a move fit it.
export function fitTransform(part: BakedPart, box: FitBox) {
  const scale: Vector = [
    box.size[0] / part.size[0],
    box.size[1] / part.size[1],
    box.size[2] / part.size[2]
  ]
  return { position: box.at, scale, yaw: box.yaw ?? 0 }
}

// A box standing `height` tall that keeps the part's own proportions.
export function standing(part: BakedPart, at: Vector, height: number): FitBox {
  const grow = height / part.size[1]
  return { at, size: [part.size[0] * grow, height, part.size[2] * grow] }
}

const [SCREEN_ACROSS, SCREEN_HEIGHT, SCREEN_ALONG] = WORKSTATIONS.corporate.screen
export const DESK_TOP_M = 0.57
const MONITOR_DEPTH_M = 0.13

// The corporate desk's footprint in its slot frame: chair at the origin, desk ahead on +z.
export function deskModelBoxes(): Record<'desk' | 'chair' | 'monitor' | 'keyboard', FitBox> {
  return {
    desk: { at: [0, 0, DESK_REACH], size: [1.2, DESK_TOP_M, 0.62] },
    chair: { at: [0, 0, 0], size: [0.42, 0.665, 0.4] },
    keyboard: { at: [0, DESK_TOP_M, DESK_REACH - 0.16], size: [0.4, 0.035, 0.15] },
    // Turned to the chair, its face 5 mm behind the plane the live screen draws on.
    monitor: {
      at: [SCREEN_ACROSS, DESK_TOP_M, SCREEN_ALONG + 0.005 + MONITOR_DEPTH_M / 2],
      size: [0.5, (SCREEN_HEIGHT - DESK_TOP_M) * 1.6, MONITOR_DEPTH_M],
      yaw: Math.PI
    }
  }
}

export interface PlacedModel {
  part: BakedPart
  box: FitBox
  color?: string
}

// A room prop's models in its own frame: back on the wall at z = 0, facing +z, as its parts are.
export function propModels(kind: PropKind): PlacedModel[] {
  const part = CAMPUS_MODELS?.furniture.get(kind)
  if (!part) return []
  if (kind === 'lamp') return [{ part, box: standing(part, [0, 0, 0], topOf(FLOOR_LAMP)) }]
  if (kind === 'plant') return [{ part, box: standing(part, [0, 0, 0], topOf(PLANT)) }]
  const { width, depth } = (kind === 'sofa' ? SOFA : BOOKSHELF).size
  if (kind === 'sofa')
    return [
      {
        part,
        box: { at: [0, 0, depth / 2], size: [width, topOf(SOFA.parts), depth] },
        color: SOFA_COLOR
      }
    ]
  // The Kenney case is narrow and tall: two side by side fill the built-in shelf.
  return [-1, 1].map((side) => ({
    part,
    box: {
      at: [(side * width) / 4, 0, depth / 2],
      size: [width / 2, topOf(BOOKSHELF.parts), depth]
    }
  }))
}
