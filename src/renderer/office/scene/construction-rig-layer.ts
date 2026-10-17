import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3
} from 'three'
import { CITY_EVENT_LIFE_MS, type CityEvent } from '../../office-live/city-events'
import type { BuildingPlaces } from '../logic/building-place'
import { BOXES_PER_RIG, rigPose, type BoxPose, type RigSite } from '../logic/construction-rig'
import type { QualityLevel } from '../logic/quality'
import type { FloorGeometry } from '../scene-model'
import { spireModules } from '../themes/spire-parts'
import type { OfficeTheme } from '../themes/types'
import { floorElevation } from './all-floor-model'

const RIGS = 4

export interface RigFrame {
  events: readonly CityEvent[]
  floorsOf: (buildingId: string) => readonly FloorGeometry[] | undefined
  places: Pick<BuildingPlaces, 'place'>
  nowMs: number
  isPinned: boolean
  level: QualityLevel
}

const hidden = new Matrix4().makeScale(0, 0, 0)
const UP = new Vector3(0, 1, 0)

// The module is shinier than the rig, so no batcher can fold the two draws into one.
function rigMesh(capacity: number, surface: { roughness: number; metalness: number }) {
  const mesh = new InstancedMesh(
    new BoxGeometry(1, 1, 1),
    new MeshStandardMaterial(surface),
    capacity
  )
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.frustumCulled = false
  mesh.raycast = () => undefined
  for (let index = 0; index < capacity; index += 1) mesh.setMatrixAt(index, hidden)
  return mesh
}

// A transient over a spire stage crossing: two draws, written only while a hoist is live.
export function createConstructionRigLayer(theme: OfficeTheme) {
  const rig = rigMesh(RIGS * BOXES_PER_RIG, { roughness: 0.8, metalness: 0.15 })
  const module = rigMesh(RIGS, { roughness: 0.55, metalness: 0.3 })
  // The hoisted piece is the spire's own module, so what lands is what grows.
  const [piece] = spireModules(theme)
  const { lacquer, ink, brass } = theme.palette
  const roles = [lacquer, lacquer, lacquer, ink, ...Array<string>(8).fill(brass)]
  const color = new Color()
  for (let index = 0; index < RIGS * BOXES_PER_RIG; index += 1)
    rig.setColorAt(index, color.set(roles[index % BOXES_PER_RIG]))
  for (let index = 0; index < RIGS; index += 1) module.setColorAt(index, color.set(piece.color))
  const group = new Group()
  group.add(rig, module)
  const matrix = new Matrix4()
  const turn = new Quaternion()
  const at = new Vector3()
  const size = new Vector3()
  let wasDrawn = false

  const put = (mesh: InstancedMesh, index: number, pose: BoxPose | null): void => {
    if (!pose) {
      mesh.setMatrixAt(index, hidden)
      return
    }
    turn.setFromAxisAngle(UP, pose.yaw)
    mesh.setMatrixAt(index, matrix.compose(at.set(...pose.at), turn, size.set(...pose.size)))
  }

  const siteOf = (event: CityEvent, frame: RigFrame): RigSite | null => {
    const floors = frame.floorsOf(event.buildingId)
    const spire = frame.places.place(event.buildingId).topAt(frame.nowMs, frame.isPinned)
    if (!floors?.length || !spire) return null
    const ordered = [...floors].sort((a, b) => floorElevation(a) - floorElevation(b))
    return { ground: ordered[0], top: ordered[ordered.length - 1], spire }
  }

  const update = (frame: RigFrame): void => {
    // Light draws no rig; reduced motion skips the hoist and lets the spire snap.
    const isShown = frame.level !== 'light' && !frame.isPinned
    rig.material.visible = isShown
    module.material.visible = isShown
    const live = isShown
      ? frame.events.flatMap((event) => {
          const progress = (frame.nowMs - event.atMs) / CITY_EVENT_LIFE_MS.hoist
          const site = event.kind === 'hoist' && progress >= 0 && progress < 1
          return site ? [{ event, progress }] : []
        })
      : []
    if (live.length === 0 && !wasDrawn) return
    let slot = 0
    for (const { event, progress } of live.slice(0, RIGS)) {
      const site = siteOf(event, frame)
      if (!site) continue
      const pose = rigPose(site, progress, piece.size)
      pose.boxes.forEach((box, index) => put(rig, slot * BOXES_PER_RIG + index, box))
      put(module, slot, pose.module)
      slot += 1
    }
    for (let empty = slot; empty < RIGS; empty += 1) {
      put(module, empty, null)
      for (let box = 0; box < BOXES_PER_RIG; box += 1) put(rig, empty * BOXES_PER_RIG + box, null)
    }
    rig.instanceMatrix.needsUpdate = true
    module.instanceMatrix.needsUpdate = true
    wasDrawn = slot > 0
  }

  const dispose = (): void => {
    for (const mesh of [rig, module]) {
      mesh.geometry.dispose()
      mesh.material.dispose()
      mesh.dispose()
    }
  }

  return { group, rig, module, update, dispose }
}
