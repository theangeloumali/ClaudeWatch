import {
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type BufferAttribute,
  type BufferGeometry,
  type Camera,
  type Texture
} from 'three'
import type { WorldVenue } from '../../../shared/office/world-document'
import { WORLD_DOCUMENT_LIMITS } from '../../../shared/office/world-document-limits'
import { buildingPlace, type PlaceTop } from '../logic/building-place'
import {
  SIGN_BOARD,
  signInk,
  venueSign,
  type ProjectSigns,
  type SignIcon
} from '../logic/project-signs'
import type { ThemePalette } from '../themes/types'
import { venueLandmark } from '../themes/venue-landmarks'
import { cellOffset } from './sign-atlas'

const CAPACITY = WORLD_DOCUMENT_LIMITS.buildings + 5
const SIGN_M = 3
// A readable size on screen at every zoom (N7): orthographic size follows zoom, not distance.
const MIN_PX = 18
const MAX_PX = 40
const LIFT_M = 0.6
export const SIGN_DISC_DEPTH = 0.12
const FACE_SHARE = 0.72
// translateZ ignores scale, so the face's offset is sized by hand.
const FACE_GAP = 0.02

export const signSizeM = (zoom: number): number =>
  Math.min(MAX_PX / zoom, Math.max(MIN_PX / zoom, SIGN_M))

export const VENUE_BOARD = (palette: ThemePalette): string => palette.gold

export interface SignHost {
  key: string
  top: (nowMs: number, isPinned: boolean) => PlaceTop | null
  // Null is a dark sign.
  look: { icon: SignIcon; board: string } | null
}

export interface SignFrame {
  hosts: readonly SignHost[]
  camera: Camera
  nowMs: number
  isPinned: boolean
  isCameraMoved: boolean
}

function faceMaterial(atlas: Texture | null): MeshBasicMaterial {
  const material = new MeshBasicMaterial({
    map: atlas,
    transparent: true,
    depthWrite: false,
    toneMapped: false
  })
  // Its own program: this patch must never reach a batched or shared material (N2).
  material.customProgramCacheKey = () => 'city-sign-face'
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 signCell;')
      .replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv += signCell;\n#endif'
      )
  }
  return material
}

function signMesh(geometry: BufferGeometry, material: MeshBasicMaterial): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, CAPACITY)
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.frustumCulled = false
  // Signs take no pointer: a click goes through to the building.
  mesh.raycast = () => undefined
  mesh.count = 0
  return mesh
}

interface DirtyRange {
  first: number
  last: number
}

function sendRange(attribute: BufferAttribute | null | undefined, range: DirtyRange): void {
  if (!attribute || range.last < 0) return
  const size = attribute.itemSize
  attribute.addUpdateRange(range.first * size, (range.last - range.first + 1) * size)
  attribute.needsUpdate = true
}

const hidden = new Matrix4().makeScale(0, 0, 0)
const isSameTop = (a: PlaceTop | null, b: PlaceTop | null | undefined): boolean =>
  a?.x === b?.x && a?.y === b?.y && a?.z === b?.z

// Two draws for every sign: a disc tinted by state and an atlas face tinted ink.
export function createCitySignsLayer(atlas: Texture | null) {
  const discShape = new CylinderGeometry(0.5, 0.5, SIGN_DISC_DEPTH, 32).rotateX(Math.PI / 2)
  const disc = signMesh(discShape, new MeshBasicMaterial({ toneMapped: false }))
  const face = signMesh(new PlaneGeometry(FACE_SHARE, FACE_SHARE), faceMaterial(atlas))
  const cells = new InstancedBufferAttribute(new Float32Array(CAPACITY * 2), 2)
  face.geometry.setAttribute('signCell', cells)
  const group = new Group()
  group.add(disc, face)
  const looks: string[] = []
  const tops: (PlaceTop | null)[] = []
  const pose = { quaternion: new Quaternion(), zoom: Number.NaN }
  const matrix = new Matrix4()
  const centre = new Vector3()
  const toward = new Vector3()
  const scale = new Vector3()
  const color = new Color()

  const place = (index: number, top: PlaceTop | null): void => {
    if (!top) {
      disc.setMatrixAt(index, hidden)
      face.setMatrixAt(index, hidden)
      return
    }
    const size = signSizeM(pose.zoom)
    centre.set(top.x, top.y + LIFT_M + size / 2, top.z)
    disc.setMatrixAt(index, matrix.compose(centre, pose.quaternion, scale.setScalar(size)))
    toward.set(0, 0, 1).applyQuaternion(pose.quaternion)
    centre.addScaledVector(toward, size * (SIGN_DISC_DEPTH / 2 + FACE_GAP))
    face.setMatrixAt(index, matrix.compose(centre, pose.quaternion, scale.set(size, size, 1)))
  }

  const dress = (index: number, look: NonNullable<SignHost['look']>): void => {
    disc.setColorAt(index, color.set(look.board))
    face.setColorAt(index, color.set(signInk(look.board)))
    const [u, v] = cellOffset(look.icon)
    cells.setXY(index, u, v)
  }

  const update = ({ hosts, camera, nowMs, isPinned, isCameraMoved }: SignFrame): void => {
    const count = Math.min(hosts.length, CAPACITY)
    const zoom = camera instanceof OrthographicCamera ? camera.zoom : 1
    const isTurned =
      isCameraMoved && (zoom !== pose.zoom || !pose.quaternion.equals(camera.quaternion))
    if (isTurned) {
      pose.quaternion.copy(camera.quaternion)
      pose.zoom = zoom
    }
    const moved: DirtyRange = { first: count, last: -1 }
    const dressed: DirtyRange = { first: count, last: -1 }
    const mark = (range: DirtyRange, index: number): void => {
      range.first = Math.min(range.first, index)
      range.last = Math.max(range.last, index)
    }
    for (let index = 0; index < count; index += 1) {
      const { look, top } = hosts[index]
      const lookKey = look ? `${look.icon}|${look.board}` : ''
      const isRedressed = index >= disc.count || looks[index] !== lookKey
      if (isRedressed && look) dress(index, look)
      if (isRedressed) mark(dressed, index)
      looks[index] = lookKey
      const at = look ? top(nowMs, isPinned) : null
      if (!isTurned && !isRedressed && isSameTop(at, tops[index])) continue
      tops[index] = at
      place(index, at)
      mark(moved, index)
    }
    disc.count = count
    face.count = count
    sendRange(disc.instanceMatrix, moved)
    sendRange(face.instanceMatrix, moved)
    sendRange(disc.instanceColor, dressed)
    sendRange(face.instanceColor, dressed)
    sendRange(cells, dressed)
  }

  const dispose = (): void => {
    for (const mesh of [disc, face]) {
      mesh.geometry.dispose()
      if (!Array.isArray(mesh.material)) mesh.material.dispose()
      mesh.dispose()
    }
    atlas?.dispose()
  }

  return { group, update, dispose }
}

export function venueSignHosts(venues: readonly WorldVenue[], palette: ThemePalette): SignHost[] {
  return venues.map((venue) => {
    const parts = venueLandmark(venue, palette)
    const top = {
      x: venue.footprint.x,
      y: Math.max(0, ...parts.map((part) => part.at[1] + part.size[1] / 2)),
      z: venue.footprint.z
    }
    return {
      key: venue.id,
      top: () => top,
      look: { icon: venueSign(venue.kind).icon, board: VENUE_BOARD(palette) }
    }
  })
}

// Each tower's sign rides its live roof, spire included.
export const projectSignHosts = (signs: ProjectSigns): SignHost[] =>
  [...signs.all()].map(([buildingId, state]) => ({
    key: buildingId,
    top: (nowMs, isPinned) => buildingPlace(buildingId).topAt(nowMs, isPinned),
    look: state && { icon: state.icon, board: SIGN_BOARD[state.tint] }
  }))
