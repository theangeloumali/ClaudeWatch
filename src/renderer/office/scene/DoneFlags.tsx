import { Color, DoubleSide, MeshLambertMaterial, type BufferGeometry, type Camera } from 'three'
import { clamp, type Range } from '../../../shared/range'
import { CITY_EVENT_LIFE_MS } from '../../office-live/city-events'
import { box, mergeParts, tube } from '../citizens/figure-parts'
import type { BuildingSignal } from '../logic/city-signals'
import { draw, hashOf } from '../themes/lot-math'
import type { ThemePalette } from '../themes/types'
import { cameraAzimuth, markSites, screenMetres, type CityMarkFrame } from './city-marks'
import { createMarkMesh, type MarkMesh } from './mark-mesh'
import { markGated, useMarkLayer, type MarkLayerProps } from './use-mark-layer'

const MAX_FLAGS = 16
const FLAG_PX = 30
// A screen size held in metres: near in it stays a real flag, far out it never towers.
const FLAG_M: Range = [2, 5]
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
const flagGeometry = (palette: ThemePalette): BufferGeometry =>
  mergeParts('done flag', [
    tube(palette.brass, [0.025, 0.025, 1], [0, 0.5, 0]),
    box(palette.paper, [0.55, 0.32, 0.02], [0.3, 0.84, 0])
  ])

// "This agent finished its turn": a flag over the office for exactly the bridge's done badge.
// A done edge seen live raises it; one already done at first sight is drawn up.
export function createFlagLayer(palette: ThemePalette): FlagLayer {
  const paint = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide })
  const marks = createMarkMesh(flagGeometry(palette), paint, MAX_FLAGS)
  const flutterSeeds = new Map<string, number>()
  const seedOf = (buildingId: string): number => {
    let seed = flutterSeeds.get(buildingId)
    if (seed === undefined) {
      seed = draw(hashOf(buildingId), 0)
      flutterSeeds.set(buildingId, seed)
    }
    return seed
  }
  return {
    mesh: marks.mesh,
    draw(frame, azimuth) {
      let count = 0
      const height = clamp(screenMetres(FLAG_PX, frame.zoom), FLAG_M)
      for (const buildingId of markSites(frame, isDone, MAX_FLAGS)) {
        const top = frame.topOf(buildingId)
        if (!top) continue
        const raising = frame.events.find(
          (event) => event.kind === 'done' && event.buildingId === buildingId
        )
        const share = raising ? (frame.nowMs - raising.atMs) / CITY_EVENT_LIFE_MS.done : 1
        const raise = frame.isPinned ? 1 : raiseEase(clamp(share, [0, 1]))
        const seed = seedOf(buildingId)
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

const drawFlags = (layer: FlagLayer, frame: CityMarkFrame, camera: Camera): void =>
  layer.draw(frame, cameraAzimuth(camera))

function FlagMesh(props: MarkLayerProps) {
  return useMarkLayer(createFlagLayer, drawFlags, props)
}

export const DoneFlags = markGated(FlagMesh)
