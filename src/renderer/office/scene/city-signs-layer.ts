import {
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Camera,
  type Texture
} from 'three'
import type { WorldVenue } from '../../../shared/office/world-document'
import { WORLD_DOCUMENT_LIMITS } from '../../../shared/office/world-document-limits'
import { buildingPlaces, type BuildingPlaces, type PlaceTop } from '../logic/building-place'
import {
  SIGN_BOARD,
  signInk,
  venueSign,
  type ProjectSigns,
  type SignIcon
} from '../logic/project-signs'
import { topOf } from '../themes/parts'
import type { ThemePalette } from '../themes/types'
import { venueLandmark } from '../themes/venue-landmarks'
import { cameraZoom, markSizeM, type MarkSize } from './city-marks'
import { cleanRange, flush, writeChanged, type DirtyRange } from './mark-mesh'
import { HIDDEN_MATRIX } from './mesh-batches'
import { cellOffset } from './sign-atlas'

const CAPACITY = WORLD_DOCUMENT_LIMITS.buildings + 5
// A readable size on screen at every zoom (N7); Horizon keeps room for it however far out.
const SIGN_SIZE: MarkSize = { metres: 3, pixels: [18, 40] }
const LIFT_M = 0.6
export const SIGN_DISC_DEPTH = 0.12
const FACE_SHARE = 0.72
// translateZ ignores scale, so the face's offset is sized by hand.
const FACE_GAP = 0.02

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
  // Unchanged with the same hosts, the same pose and a still place store: nothing to re-pose.
  places?: Pick<BuildingPlaces, 'version' | 'isEasing'>
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
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3)
  mesh.frustumCulled = false
  // Signs take no pointer: a click goes through to the building.
  mesh.raycast = () => undefined
  mesh.count = 0
  return mesh
}

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
  const rgb = [0, 0, 0]
  const ranges = {
    disc: cleanRange(),
    face: cleanRange(),
    discColor: cleanRange(),
    faceColor: cleanRange(),
    cells: cleanRange()
  }
  let drawn: { hosts: readonly SignHost[] | null; placesVersion: number; isPinned: boolean } = {
    hosts: null,
    placesVersion: -1,
    isPinned: false
  }

  const writeColor = (mesh: InstancedMesh, index: number, range: DirtyRange): void => {
    if (!mesh.instanceColor) return
    rgb[0] = color.r
    rgb[1] = color.g
    rgb[2] = color.b
    writeChanged(mesh.instanceColor, rgb, index, range)
  }

  const place = (index: number, top: PlaceTop | null): void => {
    if (!top) {
      writeChanged(disc.instanceMatrix, HIDDEN_MATRIX.elements, index, ranges.disc)
      writeChanged(face.instanceMatrix, HIDDEN_MATRIX.elements, index, ranges.face)
      return
    }
    const size = markSizeM(SIGN_SIZE, pose.zoom)
    centre.set(top.x, top.y + LIFT_M + size / 2, top.z)
    matrix.compose(centre, pose.quaternion, scale.setScalar(size))
    writeChanged(disc.instanceMatrix, matrix.elements, index, ranges.disc)
    toward.set(0, 0, 1).applyQuaternion(pose.quaternion)
    centre.addScaledVector(toward, size * (SIGN_DISC_DEPTH / 2 + FACE_GAP))
    matrix.compose(centre, pose.quaternion, scale.set(size, size, 1))
    writeChanged(face.instanceMatrix, matrix.elements, index, ranges.face)
  }

  const dress = (index: number, look: NonNullable<SignHost['look']>): void => {
    color.set(look.board)
    writeColor(disc, index, ranges.discColor)
    color.set(signInk(look.board))
    writeColor(face, index, ranges.faceColor)
    writeChanged(cells, cellOffset(look.icon), index, ranges.cells)
  }

  const update = (frame: SignFrame): void => {
    const { hosts, camera, nowMs, isPinned, isCameraMoved, places } = frame
    const count = Math.min(hosts.length, CAPACITY)
    const zoom = cameraZoom(camera)
    const isTurned =
      isCameraMoved && (zoom !== pose.zoom || !pose.quaternion.equals(camera.quaternion))
    if (isTurned) {
      pose.quaternion.copy(camera.quaternion)
      pose.zoom = zoom
    }
    const placesVersion = places?.version() ?? -1
    const isStill =
      places !== undefined &&
      !isTurned &&
      hosts === drawn.hosts &&
      placesVersion === drawn.placesVersion &&
      isPinned === drawn.isPinned &&
      !places.isEasing(nowMs, isPinned)
    if (isStill) return
    drawn = { hosts, placesVersion, isPinned }
    for (let index = 0; index < count; index += 1) {
      const { look, top } = hosts[index]
      const lookKey = look ? `${look.icon}|${look.board}` : ''
      const isRedressed = index >= disc.count || looks[index] !== lookKey
      if (isRedressed && look) dress(index, look)
      looks[index] = lookKey
      const at = look ? top(nowMs, isPinned) : null
      if (!isTurned && !isRedressed && isSameTop(at, tops[index])) continue
      tops[index] = at
      place(index, at)
    }
    disc.count = count
    face.count = count
    flush(disc.instanceMatrix, ranges.disc)
    flush(face.instanceMatrix, ranges.face)
    if (disc.instanceColor) flush(disc.instanceColor, ranges.discColor)
    if (face.instanceColor) flush(face.instanceColor, ranges.faceColor)
    flush(cells, ranges.cells)
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
    const top = {
      x: venue.footprint.x,
      y: Math.max(0, topOf(venueLandmark(venue, palette))),
      z: venue.footprint.z
    }
    return {
      key: venue.id,
      top: () => top,
      look: { icon: venueSign(venue.kind).icon, board: palette.gold }
    }
  })
}

// Each tower's sign rides its live roof, spire included.
export const projectSignHosts = (signs: ProjectSigns): SignHost[] =>
  [...signs.all()].map(([buildingId, state]) => ({
    key: buildingId,
    top: (nowMs, isPinned) => buildingPlaces.topAt(buildingId, nowMs, isPinned),
    look: state && { icon: state.icon, board: SIGN_BOARD[state.tint] }
  }))
