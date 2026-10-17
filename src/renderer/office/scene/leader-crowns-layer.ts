import {
  Color,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Camera
} from 'three'
import type { AgentView } from '../../../shared/office/types'
import { livePose, type PoseStore } from '../../office-live/pose-store'
import { box as figureBox, mergeParts } from '../citizens/figure-parts'
import type { BuildingPlaces } from '../logic/building-place'
import { box, type PartSpec } from '../themes/parts'
import type { ThemePalette } from '../themes/types'
import { CARD_HEIGHT } from './CardProjector'
import {
  CARD_GAP_PX,
  cameraAzimuth,
  cameraZoom,
  CROWN_MAX_PX,
  markSizeM,
  NAME_CARD_MAX_PX,
  screenMetres,
  type MarkSize
} from './city-marks'
import { createMarkMesh } from './mark-mesh'
import { storeSlot } from './snapshot-slot'

const CROWNS = 3
// A readable size on screen at every zoom (N7); Horizon keeps room for it however far out.
const CROWN_SIZE: MarkSize = { metres: 2.4, pixels: [14, CROWN_MAX_PX] }
const CROWN_HEIGHT = 0.6
const ROOF_LIFT_M = 0.6
const WHITE = new Color(1, 1, 1)

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
const crownGeometry = (palette: ThemePalette): BufferGeometry =>
  mergeParts(
    'crown',
    crownParts(palette).map(({ color, size, at }) => figureBox(color, size, at))
  ).translate(0, -CROWN_HEIGHT / 2, 0)

export interface CrownFrame {
  // Lead agent keys, the day's top three.
  crowned: readonly string[]
  agents: ReadonlyMap<string, AgentView>
  // Each agent's office, by agent key.
  buildings: ReadonlyMap<string, string>
  places: Pick<BuildingPlaces, 'topAt' | 'version' | 'isEasing'>
  poses: PoseStore
  camera: Camera
  nowMs: number
  isPinned: boolean
}

const UP = new Vector3(0, 1, 0)
// The crown's box corners about its centre, before scale and turn.
const CORNERS = [-1, 1].flatMap((x) =>
  [-1, 1].flatMap((y) => [-1, 1].map((z) => new Vector3(x * 0.5, (y * CROWN_HEIGHT) / 2, z * 0.52)))
)

const isAtDesk = (agent: AgentView): boolean => agent.place === undefined

// Camera turn and zoom, poses, places, agents, buildings, the pin, then one slot per crown.
const PRINT_SLOTS = 10 + CROWNS

// Writes what a frame's crowns depend on into `print`, in place; an unchanged print draws nothing.
function stampPrint(print: unknown[], frame: CrownFrame): boolean {
  const { camera, places, crowned } = frame
  const { x, y, z, w } = camera.quaternion
  let changes =
    storeSlot(print, 0, x) |
    storeSlot(print, 1, y) |
    storeSlot(print, 2, z) |
    storeSlot(print, 3, w) |
    storeSlot(print, 4, cameraZoom(camera)) |
    storeSlot(print, 5, frame.poses.version()) |
    storeSlot(print, 6, places.version()) |
    storeSlot(print, 7, frame.agents) |
    storeSlot(print, 8, frame.buildings) |
    storeSlot(print, 9, frame.isPinned)
  for (let index = 0; index < CROWNS; index += 1)
    changes |= storeSlot(print, 10 + index, crowned[index])
  return changes !== 0
}

export function createLeaderCrownsLayer(palette: ThemePalette) {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 })
  const marks = createMarkMesh(crownGeometry(palette), material, CROWNS)
  const [cameraUp, corner] = [new Vector3(), new Vector3()]
  const turn = new Quaternion()
  const print = new Array<unknown>(PRINT_SLOTS)

  // Each crown sits clear of its card on screen and of its own roof. Every crown shares the
  // frame's size and turn, so its lowest corner on screen is worked out once.
  const update = (frame: CrownFrame): void => {
    if (!stampPrint(print, frame) && !frame.places.isEasing(frame.nowMs, frame.isPinned)) return
    const zoom = cameraZoom(frame.camera)
    const size = markSizeM(CROWN_SIZE, zoom)
    const half = (size * CROWN_HEIGHT) / 2
    const azimuth = cameraAzimuth(frame.camera)
    cameraUp.copy(UP).applyQuaternion(frame.camera.quaternion)
    turn.setFromAxisAngle(UP, azimuth)
    let lowest = Infinity
    for (const point of CORNERS)
      lowest = Math.min(
        lowest,
        corner.copy(point).multiplyScalar(size).applyQuaternion(turn).dot(cameraUp)
      )
    const overCard = (screenMetres(NAME_CARD_MAX_PX + CARD_GAP_PX, zoom) - lowest) / cameraUp.y
    for (let index = 0; index < CROWNS; index += 1) {
      const key = frame.crowned[index]
      const agent = key === undefined ? undefined : frame.agents.get(key)
      if (!agent || agent.place === 'leaving') {
        marks.hide(index)
        continue
      }
      const at = livePose(frame.poses, agent)
      const buildingId = isAtDesk(agent) ? frame.buildings.get(agent.agentKey) : undefined
      const roof = buildingId ? frame.places.topAt(buildingId, frame.nowMs, frame.isPinned) : null
      const y = Math.max(
        at.elevation + CARD_HEIGHT + overCard,
        roof ? roof.y + ROOF_LIFT_M + half : -Infinity
      )
      const pose = { x: at.x, y, z: at.z, scaleX: size, scaleY: size, scaleZ: size }
      marks.put(index, { ...pose, rotationY: azimuth }, WHITE)
    }
    marks.finish(CROWNS)
  }

  return { mesh: marks.mesh, update, dispose: marks.dispose }
}
