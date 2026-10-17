import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { BoxGeometry, Color, MeshLambertMaterial } from 'three'
import { CITY_EVENT_LIFE_MS, type CityEvent } from '../../office-live/city-events'
import type { ZoomBand } from '../logic/camera-bands'
import type { BuildingSignal } from '../logic/city-signals'
import type { ThemePalette } from '../themes/types'
import {
  createMarkMesh,
  isMarkLevel,
  markSites,
  readCityMarks,
  useMarkLevel,
  type CityMarkFrame,
  type MarkMesh
} from './city-marks'
import { BURST_SPARKS, burstParts, hoistPose, PUFFS, puffPose } from './city-particle-motion'

const MAX_SMOKE_SITES = 8
const MAX_BURSTS = 3
const MAX_HOISTS = 3
const CAPACITY = MAX_SMOKE_SITES * PUFFS + MAX_HOISTS + MAX_BURSTS * BURST_SPARKS

export interface ParticleLayer {
  mesh: MarkMesh['mesh']
  draw(frame: CityMarkFrame): void
  dispose(): void
}

const inTrouble = (signal: BuildingSignal): boolean => signal.hasError || signal.isLimited
const newestFirst = (left: CityEvent, right: CityEvent): number =>
  right.atMs - left.atMs || (left.id < right.id ? -1 : 1)

function eventsOf(frame: CityMarkFrame, kind: CityEvent['kind'], limit: number): CityEvent[] {
  return frame.events
    .filter((event) => event.kind === kind)
    .sort(newestFirst)
    .slice(0, limit)
}

// Smoke over offices in trouble, fireworks at token milestones and the crane's spire modules:
// one opaque instanced box for all three, so every particle in the city is one draw.
export function createParticleLayer(palette: ThemePalette): ParticleLayer {
  const marks = createMarkMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial(), CAPACITY)
  const steam = new Color(palette.steam)
  const haze = new Color(palette.stone)
  const module = new Color(palette.brass)
  const hot = new Color(palette.glow)
  const shellColors = [palette.gold, palette.blossom, palette.glow].map((hex) => new Color(hex))
  const tint = new Color()
  // When each site's smoke began, so its puffs start one by one.
  const smokeSince = new Map<string, number>()

  const drawSmoke = (frame: CityMarkFrame, start: number): number => {
    let count = start
    const sites = markSites(frame.signals, inTrouble, MAX_SMOKE_SITES)
    for (const buildingId of smokeSince.keys())
      if (!sites.includes(buildingId)) smokeSince.delete(buildingId)
    for (const buildingId of sites) {
      const top = frame.topOf(buildingId)
      if (!top) continue
      const sinceMs = smokeSince.get(buildingId) ?? frame.nowMs
      smokeSince.set(buildingId, sinceMs)
      for (let puff = 0; puff < PUFFS; puff++) {
        const { nowMs, zoom, isPinned } = frame
        const drawn = puffPose({ top, buildingId, puff, sinceMs, nowMs, zoom, isPinned })
        // Opaque puffs thin by fading into the haze, which saves a transparent draw.
        if (drawn) marks.put(count++, drawn.pose, tint.copy(steam).lerp(haze, drawn.share))
      }
    }
    return count
  }

  const drawHoists = (frame: CityMarkFrame, start: number): number => {
    let count = start
    // Reduced motion skips the hoist: the spire simply stands at its new stage.
    if (frame.isPinned) return count
    for (const event of eventsOf(frame, 'hoist', MAX_HOISTS)) {
      const top = frame.topOf(event.buildingId)
      const ageMs = frame.nowMs - event.atMs
      if (top) marks.put(count++, hoistPose(top, ageMs, CITY_EVENT_LIFE_MS.hoist), module)
    }
    return count
  }

  const drawBursts = (frame: CityMarkFrame, start: number): number => {
    let count = start
    for (const event of eventsOf(frame, 'milestone', MAX_BURSTS)) {
      const top = frame.topOf(event.buildingId)
      if (!top) continue
      const ageMs = frame.nowMs - event.atMs
      for (const part of burstParts(top, ageMs, frame.zoom, frame.isPinned))
        marks.put(count++, part.pose, tint.copy(hot).lerp(shellColors[part.shell], part.bloom))
    }
    return count
  }

  return {
    mesh: marks.mesh,
    draw(frame) {
      if (frame.band === 'desk') {
        smokeSince.clear()
        marks.finish(0)
        return
      }
      marks.finish(drawBursts(frame, drawHoists(frame, drawSmoke(frame, 0))))
    },
    dispose: marks.dispose
  }
}

interface CityParticlesProps {
  palette: ThemePalette
  band: ZoomBand
}

function ParticleMesh({ palette, band }: CityParticlesProps) {
  const layer = useMemo(() => createParticleLayer(palette), [palette])
  useEffect(() => () => layer.dispose(), [layer])
  // Reads the module stores each frame: no React commit while the city is idle.
  useFrame(({ camera }) => layer.draw(readCityMarks(band, camera.zoom)))
  return <primitive object={layer.mesh} />
}

export function CityParticles(props: CityParticlesProps) {
  return isMarkLevel(useMarkLevel()) ? <ParticleMesh {...props} /> : null
}
