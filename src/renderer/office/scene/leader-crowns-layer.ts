import {
  BoxGeometry,
  BufferAttribute,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  OrthographicCamera,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Camera
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { AgentView } from '../../../shared/office/types'
import { livePose, type PoseStore } from '../../office-live/pose-store'
import type { BuildingPlaces } from '../logic/building-place'
import { box, type PartSpec } from '../themes/parts'
import type { ThemePalette } from '../themes/types'
import { CARD_HEIGHT } from './CardProjector'

const CROWNS = 3
const CROWN_M = 2.4
// A readable size on screen at every zoom (N7).
const MIN_PX = 14
const MAX_PX = 32
const CROWN_HEIGHT = 0.6
// The tallest name card NameCards draws (title, detail and the review button), and a gap.
export const NAME_CARD_MAX_PX = 72
const CARD_GAP_PX = 6
const ROOF_LIFT_M = 0.6

export const crownSizeM = (zoom: number): number =>
  Math.min(MAX_PX / zoom, Math.max(MIN_PX / zoom, CROWN_M))

// One unit across, its front toward +z: a band with corner posts and spikes, a gem front and back.
export function crownParts({ gold, glow }: ThemePalette): PartSpec[] {
  const parts: PartSpec[] = []
  for (const side of [-1, 1]) {
    parts.push(box([0, 0.15, side * 0.42], [0.84, 0.3, 0.12], gold))
    parts.push(box([side * 0.42, 0.15, 0], [0.12, 0.3, 0.72], gold))
    parts.push(box([0, 0.39, side * 0.42], [0.14, 0.18, 0.1], gold))
    parts.push(box([side * 0.42, 0.39, 0], [0.1, 0.18, 0.14], gold))
    for (const across of [-1, 1])
      parts.push(box([across * 0.42, CROWN_HEIGHT / 2, side * 0.42], [0.16, 0.6, 0.16], gold))
    parts.push(box([0, 0.15, side * 0.5], [0.16, 0.12, 0.04], glow))
  }
  return parts
}

// A merged geometry is its own draw (N1), which is what one instanced crown mesh wants.
function crownGeometry(palette: ThemePalette): BufferGeometry {
  const color = new Color()
  const pieces = crownParts(palette).map((part) => {
    const piece = new BoxGeometry(...part.size).translate(...part.at)
    const { count } = piece.getAttribute('position')
    const colors = new Float32Array(count * 3)
    color.set(part.color)
    for (let vertex = 0; vertex < count; vertex += 1) color.toArray(colors, vertex * 3)
    return piece.setAttribute('color', new BufferAttribute(colors, 3))
  })
  const merged = mergeGeometries(pieces)
  for (const piece of pieces) piece.dispose()
  if (!merged) throw new Error('The crown parts do not merge')
  return merged.translate(0, -CROWN_HEIGHT / 2, 0)
}

export interface CrownFrame {
  // Lead agent keys, the day's top three.
  crowned: readonly string[]
  agents: ReadonlyMap<string, AgentView>
  buildingOf: (agentKey: string) => string | null
  places: Pick<BuildingPlaces, 'place'>
  poses: PoseStore
  camera: Camera
  nowMs: number
  isPinned: boolean
}

const hidden = new Matrix4().makeScale(0, 0, 0)
const UP = new Vector3(0, 1, 0)
// The crown's box corners about its centre, before scale and turn.
const CORNERS = [-1, 1].flatMap((x) =>
  [-1, 1].flatMap((y) => [-1, 1].map((z) => new Vector3(x * 0.5, (y * CROWN_HEIGHT) / 2, z * 0.52)))
)

const isAtDesk = (agent: AgentView): boolean =>
  agent.venueId === undefined && agent.place === undefined

export function createLeaderCrownsLayer(palette: ThemePalette) {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 })
  const mesh = new InstancedMesh(crownGeometry(palette), material, CROWNS)
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.frustumCulled = false
  mesh.raycast = () => undefined
  const drawn = Array.from({ length: CROWNS }, () => hidden.clone())
  for (let index = 0; index < CROWNS; index += 1) mesh.setMatrixAt(index, hidden)
  const group = new Group()
  group.add(mesh)
  const [matrix, centre, scale, cameraUp, toCamera, corner] = [
    new Matrix4(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3()
  ]
  const turn = new Quaternion()

  // Centre height that keeps the whole crown above its card on screen, and above its own roof.
  const pose = (agent: AgentView, frame: CrownFrame, zoom: number): Matrix4 => {
    const size = crownSizeM(zoom)
    const at = livePose(frame.poses, agent)
    cameraUp.copy(UP).applyQuaternion(frame.camera.quaternion)
    frame.camera.getWorldDirection(toCamera).negate()
    turn.setFromAxisAngle(UP, Math.atan2(toCamera.x, toCamera.z))
    const lowest = Math.min(
      ...CORNERS.map((point) =>
        corner.copy(point).multiplyScalar(size).applyQuaternion(turn).dot(cameraUp)
      )
    )
    const clearance = (NAME_CARD_MAX_PX + CARD_GAP_PX) / zoom
    let y = at.elevation + CARD_HEIGHT + (clearance - lowest) / cameraUp.y
    const buildingId = isAtDesk(agent) ? frame.buildingOf(agent.agentKey) : null
    const roof = buildingId
      ? frame.places.place(buildingId).topAt(frame.nowMs, frame.isPinned)
      : null
    if (roof) y = Math.max(y, roof.y + ROOF_LIFT_M + (size * CROWN_HEIGHT) / 2)
    return matrix.compose(centre.set(at.x, y, at.z), turn, scale.setScalar(size))
  }

  // Writes only the crowns that moved, so a still city uploads nothing.
  const update = (frame: CrownFrame): void => {
    const zoom = frame.camera instanceof OrthographicCamera ? frame.camera.zoom : 1
    let first = CROWNS
    let last = -1
    for (let index = 0; index < CROWNS; index += 1) {
      const key = frame.crowned[index]
      const agent = key === undefined ? undefined : frame.agents.get(key)
      const next = agent && agent.place !== 'leaving' ? pose(agent, frame, zoom) : hidden
      if (drawn[index].equals(next)) continue
      drawn[index].copy(next)
      mesh.setMatrixAt(index, next)
      first = Math.min(first, index)
      last = index
    }
    if (last < 0) return
    mesh.instanceMatrix.addUpdateRange(first * 16, (last - first + 1) * 16)
    mesh.instanceMatrix.needsUpdate = true
  }

  const dispose = (): void => {
    mesh.geometry.dispose()
    material.dispose()
    mesh.dispose()
  }

  return { group, mesh, update, dispose }
}
