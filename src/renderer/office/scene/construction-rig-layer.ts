import { BoxGeometry, Color, MeshStandardMaterial } from 'three'
import { CITY_EVENT_LIFE_MS, type CityEvent } from '../../office-live/city-events'
import type { BuildingPlaces } from '../logic/building-place'
import { BOXES_PER_RIG, rigPose, type RigSite } from '../logic/construction-rig'
import type { QualityLevel } from '../logic/quality'
import type { FloorGeometry } from '../scene-model'
import type { OfficeTheme } from '../themes/types'
import { floorElevation } from './all-floor-model'
import { createMarkMesh } from './city-marks'
import { hoistPose } from './city-particle-motion'

const RIGS = 4
const LIFE_MS = CITY_EVENT_LIFE_MS.hoist

export interface RigFrame {
  events: readonly CityEvent[]
  floorsOf: (buildingId: string) => readonly FloorGeometry[] | undefined
  places: Pick<BuildingPlaces, 'place'>
  nowMs: number
  isPinned: boolean
  level: QualityLevel
}

const isLiveHoist = (event: CityEvent, nowMs: number): boolean =>
  event.kind === 'hoist' && nowMs >= event.atMs && nowMs - event.atMs < LIFE_MS

// A transient over a spire stage crossing: crane and scaffold in one draw, still while it stands.
export function createConstructionRigLayer(theme: OfficeTheme) {
  const material = new MeshStandardMaterial({ roughness: 0.8, metalness: 0.15 })
  const marks = createMarkMesh(new BoxGeometry(1, 1, 1), material, RIGS * BOXES_PER_RIG)
  marks.mesh.raycast = () => undefined
  const { lacquer, ink, brass } = theme.palette
  const roles = [lacquer, lacquer, lacquer, ink, ...Array<string>(8).fill(brass)].map(
    (role) => new Color(role)
  )

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
    material.visible = isShown
    let slot = 0
    for (const event of isShown ? frame.events : []) {
      const site = slot < RIGS && isLiveHoist(event, frame.nowMs) ? siteOf(event, frame) : null
      if (!site) continue
      // The line hangs to the seated module's top, so the falling module rides it.
      const seated = hoistPose(site.spire, LIFE_MS, LIFE_MS)
      rigPose(site, seated.y + seated.scaleY / 2).forEach((box, index) =>
        marks.put(slot * BOXES_PER_RIG + index, box, roles[index])
      )
      slot += 1
    }
    marks.finish(slot * BOXES_PER_RIG)
  }

  return { group: marks.mesh, rig: marks.mesh, update, dispose: marks.dispose }
}
