import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Color, DoubleSide, MeshLambertMaterial, Vector3, type BufferGeometry } from 'three'
import { CITY_EVENT_LIFE_MS } from '../../office-live/city-events'
import { box, citizenGeometry, tube } from '../citizens/figure-parts'
import type { ZoomBand } from '../logic/camera-bands'
import type { BuildingSignal } from '../logic/city-signals'
import type { ThemePalette } from '../themes/types'
import { hashOf } from '../themes/lot-math'
import {
  createMarkMesh,
  isMarkLevel,
  markCeiling,
  markSites,
  readCityMarks,
  screenMetres,
  useMarkLevel,
  type CityMarkFrame,
  type MarkMesh
} from './city-marks'

const MAX_FLAGS = 16
const FLAG_PX = 30
const FLAG_MIN_M = 2
const FLAG_MAX_M = 5
const FLUTTER_RAD = 0.22
const FLUTTER_MS = 1_800
const WHITE = new Color(1, 1, 1)

export interface FlagLayer {
  mesh: MarkMesh['mesh']
  // `azimuth` turns each flag to face the camera: the map rotates, a building-facing flag would
  // go edge-on at two of the four corners.
  draw(frame: CityMarkFrame, azimuth: number): void
  dispose(): void
}

const isDone = (signal: BuildingSignal): boolean => signal.isDone
const raiseEase = (share: number): number => 1 - (1 - share) ** 3

// Pole and cloth in one buffer, coloured per vertex and 1 m tall: every flag is one draw.
function flagGeometry(palette: ThemePalette): BufferGeometry {
  const geometry = citizenGeometry({
    name: 'done flag',
    parts: () => [
      tube(palette.brass, [0.025, 0.025, 1], [0, 0.5, 0]),
      box(palette.paper, [0.55, 0.32, 0.02], [0.3, 0.84, 0])
    ]
  })
  geometry.computeBoundingBox()
  const height = geometry.boundingBox ? geometry.boundingBox.max.y : 1
  return geometry.scale(1 / height, 1 / height, 1 / height)
}

// "This agent finished its turn": a flag over the office for exactly the bridge's done badge.
// A done edge seen live raises it; one already done at first sight is drawn up.
export function createFlagLayer(palette: ThemePalette): FlagLayer {
  const paint = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide })
  const marks = createMarkMesh(flagGeometry(palette), paint, MAX_FLAGS)
  return {
    mesh: marks.mesh,
    draw(frame, azimuth) {
      let count = 0
      const sites = frame.band === 'desk' ? [] : markSites(frame.signals, isDone, MAX_FLAGS)
      for (const buildingId of sites) {
        const top = frame.topOf(buildingId)
        if (!top) continue
        const height = Math.min(
          Math.min(FLAG_MAX_M, Math.max(FLAG_MIN_M, screenMetres(FLAG_PX, frame.zoom))),
          markCeiling(top) - top.y
        )
        if (height <= 0) continue
        const raising = frame.events.find(
          (event) => event.kind === 'done' && event.buildingId === buildingId
        )
        const share = raising ? (frame.nowMs - raising.atMs) / CITY_EVENT_LIFE_MS.done : 1
        const raise = frame.isPinned ? 1 : raiseEase(Math.min(1, Math.max(0, share)))
        const seed = (hashOf(buildingId) % 1_000) / 1_000
        const flutter = frame.isPinned
          ? 0
          : FLUTTER_RAD * Math.sin((frame.nowMs / FLUTTER_MS + seed) * Math.PI * 2)
        const pose = { ...top, scaleX: height, scaleY: height * raise, scaleZ: height }
        marks.put(count++, { ...pose, rotationY: azimuth + flutter }, WHITE)
      }
      marks.finish(count)
    },
    dispose: marks.dispose
  }
}

interface DoneFlagsProps {
  palette: ThemePalette
  band: ZoomBand
}

const view = new Vector3()

function FlagMesh({ palette, band }: DoneFlagsProps) {
  const layer = useMemo(() => createFlagLayer(palette), [palette])
  useEffect(() => () => layer.dispose(), [layer])
  // Reads the module stores each frame: no React commit while the city is idle.
  useFrame(({ camera }) => {
    camera.getWorldDirection(view)
    layer.draw(readCityMarks(band, camera.zoom), Math.atan2(-view.x, -view.z))
  })
  return <primitive object={layer.mesh} />
}

export function DoneFlags(props: DoneFlagsProps) {
  return isMarkLevel(useMarkLevel()) ? <FlagMesh {...props} /> : null
}
