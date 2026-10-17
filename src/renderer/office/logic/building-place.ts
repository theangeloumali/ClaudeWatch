import type { FloorGeometry } from '../scene-model'
import { floorElevation } from '../scene/all-floor-model'
import { buildingCrown, buildingExteriorProfile } from '../themes/physical-building-parts'
import { MAX_LOT_HEIGHT_M } from '../themes/surroundings'
import type { OfficeTheme } from '../themes/types'
import { SPIRE_BASE_GAP_M, spireHeight } from './token-spires'

export interface PlaceTop {
  x: number
  y: number
  z: number
}

export interface BuildingPlace {
  // `isPinned` is reduced motion: the spire stands at its stage with no ease.
  topAt(nowMs: number, isPinned: boolean): PlaceTop | null
}

export interface BuildingPlaces {
  // The roof plus its crown, from `crownTopOf`; null when the building is gone.
  setRoof(buildingId: string, roof: PlaceTop | null): void
  setStage(buildingId: string, stage: number, atMs: number): void
  place(buildingId: string): BuildingPlace
}

const SPIRE_EASE_MS = 1_200

interface SpireEase {
  fromM: number
  toM: number
  atMs: number
}

const smoothstep = (share: number): number => share * share * (3 - 2 * share)

function heightAt(ease: SpireEase, nowMs: number, isPinned: boolean): number {
  const share = Math.min(1, Math.max(0, (nowMs - ease.atMs) / SPIRE_EASE_MS))
  if (isPinned || share === 1) return ease.toM
  return ease.fromM + (ease.toM - ease.fromM) * smoothstep(share)
}

// Where the shell's crown tops out: its parts are read, never rebuilt here.
export function crownTopOf(floors: readonly FloorGeometry[], theme: OfficeTheme): PlaceTop | null {
  if (floors.length === 0) return null
  const ordered = [...floors].sort((left, right) => floorElevation(left) - floorElevation(right))
  const ground = ordered[0]
  const top = ordered[ordered.length - 1]
  const profile = buildingExteriorProfile({ floor: ground, theme })
  const crown = buildingCrown({ floor: top, theme, profile })
  const y = Math.max(...crown.map((part) => part.at[1] + part.size[1] / 2))
  return { x: top.x, y, z: top.z }
}

export function createBuildingPlaces(): BuildingPlaces {
  const roofs = new Map<string, PlaceTop>()
  const spires = new Map<string, SpireEase>()
  const topAt = (buildingId: string, nowMs: number, isPinned: boolean): PlaceTop | null => {
    const roof = roofs.get(buildingId)
    if (!roof) return null
    const ease = spires.get(buildingId)
    const height = ease ? heightAt(ease, nowMs, isPinned) : 0
    if (height <= 0) return roof
    // Nothing the port adds stands above the height rule; a taller roof keeps its own top.
    const ceiling = Math.max(roof.y, MAX_LOT_HEIGHT_M)
    return { ...roof, y: Math.min(ceiling, roof.y + SPIRE_BASE_GAP_M + height) }
  }
  return {
    setRoof(buildingId, roof) {
      if (roof) roofs.set(buildingId, roof)
      else roofs.delete(buildingId)
    },
    setStage(buildingId, stage, atMs) {
      const toM = spireHeight(stage)
      const current = spires.get(buildingId)
      if (current?.toM === toM) return
      // A first sight is settled: only a change seen live eases.
      const fromM = current ? heightAt(current, atMs, false) : toM
      spires.set(buildingId, { fromM, toM, atMs })
    },
    place: (buildingId) => ({
      topAt: (nowMs, isPinned) => topAt(buildingId, nowMs, isPinned)
    })
  }
}

// The page's places: a module store like `officePoses`, read by every mark in its frame loop.
export const buildingPlaces = createBuildingPlaces()

export const buildingPlace = (buildingId: string): BuildingPlace => buildingPlaces.place(buildingId)
