import { useEffect, useMemo, useRef } from 'react'
import { isJsonObject } from '../../../shared/json-object'
import { readStored, writeStored } from '../../office-live/browser-storage'
import { useOfficeSettings } from '../logic/office-settings'
import { levelInUse, type QualityLevel } from '../logic/quality'
import { boundsOfZone } from '../logic/zone-framing'
import { useQualityChoice } from '../quality-store'
import type { FloorGeometry } from '../scene-model'
import type { Rect } from '../themes/lot-math'
import { campusClaim, heldClaim, neededClaim } from './town-claim'
import type { TownSize } from './town-grid'
import { campusGreen, type GreenPlot } from './town-green'
import { lotOwners, townBlocks, type CampusPlan, type TownPlan } from './town-plan'
import { distributedTown } from './distributed-town'
import type { WorldFootprint } from '../../../shared/office/world-document'

export const CLAIM_STORAGE_KEY = 'claudewatch.office.claim'
const STORAGE_VERSION = 1

export interface Town {
  plan: TownPlan
  // Lot id to the company that dresses it; a lot that is absent takes the floor's theme.
  owners: ReadonlyMap<string, string>
  green: GreenPlot[]
}

// The campus town the city is laid over: it holds the claim from floor to floor.
export interface CampusTown extends Omit<Town, 'plan'> {
  plan: CampusPlan
}

// The whole town for a floor. `held` is the claim of the floor before, or null on a first start.
export function townOf(
  floor: FloorGeometry,
  held: Rect | null,
  level: QualityLevel,
  size: TownSize = 'city'
): CampusTown {
  const plan = townBlocks(campusClaim(neededClaim(floor), held), level, size)
  return { plan, owners: lotOwners(plan, floor.zones), green: campusGreen(floor, plan) }
}

function storedClaim(floor: FloorGeometry): Rect | null {
  const raw = readStored(CLAIM_STORAGE_KEY)
  if (raw === null) return null
  let stored: unknown
  try {
    stored = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isJsonObject(stored) || stored.version !== STORAGE_VERSION) return null
  return heldClaim(stored, neededClaim(floor))
}

function claimKey(claim: Rect): string {
  const { minX, maxX, minZ, maxZ } = boundsOfZone(claim)
  return JSON.stringify({
    version: STORAGE_VERSION,
    west: minX,
    east: maxX,
    north: minZ,
    south: maxZ
  })
}

// The one town the scene and the movers share. The claim is held from floor to floor, and from
// start to start through storage, so a desk column coming and going moves no building.
export function useTownPlan(
  floor: FloorGeometry,
  options: {
    protectedSites: readonly WorldFootprint[]
    preview?: { floor: FloorGeometry; protectedSites: readonly WorldFootprint[] }
  }
): Town {
  const { protectedSites, preview } = options
  const { pin, chosen } = useQualityChoice()
  const level = levelInUse(pin, chosen)
  const { townSize } = useOfficeSettings()
  // undefined until storage has been read, which happens once.
  const heldRef = useRef<Rect | null | undefined>(undefined)
  const savedRef = useRef<string | null>(null)
  const town = useMemo(() => {
    if (heldRef.current === undefined) {
      heldRef.current = storedClaim(floor)
      savedRef.current = heldRef.current && claimKey(heldRef.current)
    }
    const next = townOf(floor, heldRef.current, level, townSize)
    heldRef.current = next.plan.claim
    return distributedTown(next, protectedSites)
  }, [floor, level, townSize, protectedSites])
  const key = claimKey(town.plan.claim)
  useEffect(() => {
    if (key === savedRef.current) return
    savedRef.current = key
    writeStored(CLAIM_STORAGE_KEY, key)
  }, [key])
  return useMemo(
    () =>
      preview
        ? distributedTown(townOf(preview.floor, null, level, townSize), preview.protectedSites)
        : town,
    [preview, level, townSize, town]
  )
}
