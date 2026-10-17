import { useMemo } from 'react'
import { Color, CylinderGeometry, DoubleSide, MeshBasicMaterial } from 'three'
import type { BuildingSignal } from '../logic/city-signals'
import { STATE_COLOR } from '../office-palette'
import type { FloorGeometry } from '../scene-model'
import type { ThemePalette } from '../themes/types'
import { groundLayerY } from '../town/town-ground'
import { buildingKeyOf } from './all-floor-model'
import { easeOut, MARK_RISE_M, markSites, screenMetres, type CityMarkFrame } from './city-marks'
import { createMarkMesh, type MarkMesh } from './mark-mesh'
import { markGated, useMarkLayer, type MarkLayerProps } from './use-mark-layer'

const MAX_SITES = 8
const PARTS_PER_SITE = 3
const COLUMN_PX = 8
// The ring is a short wall, so it reads as a band from the iso camera at any zoom.
const RING_PX = 5
const RING_SPREAD_M = 6
const PULSE_MS = 1_400
const RING_PHASES = [0, 0.5] as const
// Reduced motion: the two rings stand still, part-way out.
const PINNED_SHARES = [0.3, 0.75] as const
const DEFAULT_FOOTPRINT_M = 8

export interface BeaconLayer {
  mesh: MarkMesh['mesh']
  draw(frame: CityMarkFrame, footprints: ReadonlyMap<string, number>): void
  dispose(): void
}

const needsYou = (signal: BuildingSignal): boolean => signal.needsYou

// Half the diagonal of a building's widest plates: the ring clears every corner.
export function beaconFootprints(floors: readonly FloorGeometry[]): Map<string, number> {
  const sizes = new Map<string, { width: number; depth: number }>()
  for (const floor of floors) {
    const buildingId = buildingKeyOf(floor)
    const { width, depth } = floor
    const size = sizes.get(buildingId) ?? { width: 0, depth: 0 }
    sizes.set(buildingId, {
      width: Math.max(size.width, width),
      depth: Math.max(size.depth, depth)
    })
  }
  return new Map([...sizes].map(([id, size]) => [id, Math.hypot(size.width, size.depth) / 2]))
}

// "This office needs you", seen across the city: a column off the roof and rings pulsing out
// over the street. Rings and column share one open cylinder, so every beacon is one draw.
export function createBeaconLayer(palette: ThemePalette): BeaconLayer {
  const shape = new CylinderGeometry(1, 1, 1, 24, 1, true)
  shape.translate(0, 0.5, 0)
  // Normal blending: additive vanishes against a pale day ground (ClearSpent signal-bursts).
  const paint = new MeshBasicMaterial({
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    side: DoubleSide
  })
  const marks = createMarkMesh(shape, paint, MAX_SITES * PARTS_PER_SITE)
  marks.mesh.renderOrder = 2
  // The gem's vermilion, so the beacon and the card say the same thing.
  const signal = new Color(STATE_COLOR.permission)
  const ground = new Color(palette.stone)
  const ringColor = new Color()
  return {
    mesh: marks.mesh,
    draw(frame, footprints) {
      let count = 0
      for (const buildingId of markSites(frame, needsYou, MAX_SITES)) {
        const top = frame.topOf(buildingId)
        if (!top) continue
        if (frame.band === 'building') {
          const radius = screenMetres(COLUMN_PX / 2, frame.zoom)
          const column = { ...top, scaleX: radius, scaleY: MARK_RISE_M, scaleZ: radius }
          marks.put(count++, column, signal)
        }
        const footprint = footprints.get(buildingId) ?? DEFAULT_FOOTPRINT_M
        const height = screenMetres(RING_PX, frame.zoom)
        RING_PHASES.forEach((phase, ring) => {
          const share = frame.isPinned ? PINNED_SHARES[ring] : (frame.nowMs / PULSE_MS + phase) % 1
          const radius = footprint + RING_SPREAD_M * easeOut(share)
          // Fading into the ground stands in for opacity, which instances cannot vary.
          ringColor.copy(signal).lerp(ground, share)
          const pose = { x: top.x, y: groundLayerY('beacon'), z: top.z }
          marks.put(count++, { ...pose, scaleX: radius, scaleY: height, scaleZ: radius }, ringColor)
        })
      }
      marks.finish(count)
    },
    dispose: marks.dispose
  }
}

interface CityBeaconsProps extends MarkLayerProps {
  floors: readonly FloorGeometry[]
}

function BeaconMesh({ floors, ...props }: CityBeaconsProps) {
  const footprints = useMemo(() => beaconFootprints(floors), [floors])
  return useMarkLayer(createBeaconLayer, (layer, frame) => layer.draw(frame, footprints), props)
}

export const CityBeacons = markGated(BeaconMesh)
