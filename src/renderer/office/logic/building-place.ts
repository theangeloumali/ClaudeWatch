import { clamp } from '../../../shared/range'
import type { FloorGeometry } from '../scene-model'
import { groundAndTop } from '../scene/all-floor-model'
import { buildingCrown, buildingExteriorProfile } from '../themes/physical-building-parts'
import { topOf } from '../themes/parts'
import type { OfficeTheme } from '../themes/types'
import { SPIRE_BASE_GAP_M, spireHeight } from './token-spires'

export interface PlaceTop {
  x: number
  y: number
  z: number
}

// The crown's top, which marks and spires stand over, and the deck a spire's foot reaches down to.
export interface BuildingRoof {
  crown: PlaceTop
  deck: PlaceTop
}

export interface BuildingPlaces {
  // The roof from `crownTopOf`; null when the building or its roof is gone.
  setRoof(buildingId: string, crown: PlaceTop | null, deck?: PlaceTop): void
  setStage(buildingId: string, stage: number, atMs: number): void
  // `isPinned` is reduced motion: the spire stands at its stage with no ease.
  topAt(buildingId: string, nowMs: number, isPinned: boolean): PlaceTop | null
  roofOf(buildingId: string): BuildingRoof | null
  // Bumps on a roof or stage change; tops also move while `isEasing`.
  version(): number
  isEasing(nowMs: number, isPinned: boolean): boolean
}

const SPIRE_EASE_MS = 1_200

interface SpireEase {
  fromM: number
  toM: number
  atMs: number
  // Kept so a settled spire hands out one object, not one a frame.
  settled: PlaceTop | null
}

const smoothstep = (share: number): number => share * share * (3 - 2 * share)

function heightAt(ease: SpireEase, nowMs: number, isPinned: boolean): number {
  const share = clamp((nowMs - ease.atMs) / SPIRE_EASE_MS, [0, 1])
  if (isPinned || share === 1) return ease.toM
  return ease.fromM + (ease.toM - ease.fromM) * smoothstep(share)
}

// Where the shell's crown tops out: its parts are read, never rebuilt here.
export function crownTopOf(floors: readonly FloorGeometry[], theme: OfficeTheme): PlaceTop | null {
  const storeys = groundAndTop(floors)
  if (!storeys) return null
  const profile = buildingExteriorProfile({ floor: storeys.ground, theme })
  const y = topOf(buildingCrown({ floor: storeys.top, theme, profile }))
  return { x: storeys.top.x, y, z: storeys.top.z }
}

const spireTop = (crown: PlaceTop, heightM: number): PlaceTop => ({
  ...crown,
  y: crown.y + SPIRE_BASE_GAP_M + heightM
})

export function createBuildingPlaces(): BuildingPlaces {
  const roofs = new Map<string, BuildingRoof>()
  const spires = new Map<string, SpireEase>()
  let version = 0
  let easedByMs = -Infinity
  return {
    setRoof(buildingId, crown, deck) {
      const ease = spires.get(buildingId)
      if (ease) ease.settled = null
      if (crown) roofs.set(buildingId, { crown, deck: deck ?? crown })
      else roofs.delete(buildingId)
      version += 1
    },
    setStage(buildingId, stage, atMs) {
      const toM = spireHeight(stage)
      const current = spires.get(buildingId)
      if (current?.toM === toM) return
      // A first sight is settled: only a change seen live eases.
      const fromM = current ? heightAt(current, atMs, false) : toM
      spires.set(buildingId, { fromM, toM, atMs, settled: null })
      if (fromM !== toM) easedByMs = Math.max(easedByMs, atMs + SPIRE_EASE_MS)
      version += 1
    },
    // The office's own spire stands its full stage: the 24 m lot rule guards neighbours' desks.
    topAt(buildingId, nowMs, isPinned) {
      const roof = roofs.get(buildingId)
      if (!roof) return null
      const ease = spires.get(buildingId)
      const height = ease ? heightAt(ease, nowMs, isPinned) : 0
      if (height <= 0 || !ease) return roof.crown
      if (height !== ease.toM) return spireTop(roof.crown, height)
      ease.settled ??= spireTop(roof.crown, height)
      return ease.settled
    },
    roofOf: (buildingId) => roofs.get(buildingId) ?? null,
    version: () => version,
    isEasing: (nowMs, isPinned) => !isPinned && nowMs < easedByMs
  }
}

// The page's places: a module store like `officePoses`, read by every mark in its frame loop.
export const buildingPlaces = createBuildingPlaces()
