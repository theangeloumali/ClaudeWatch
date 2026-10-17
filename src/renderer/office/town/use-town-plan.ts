import { useEffect, useMemo, useRef } from 'react'
import { isJsonObject } from '../../../shared/json-object'
import { readStored, writeStored } from '../../office-live/browser-storage'
import { useOfficeSettings } from '../logic/office-settings'
import { boundsOfZone } from '../logic/zone-framing'
import type { FloorGeometry } from '../scene-model'
import type { Rect } from '../themes/lot-math'
import { campusClaim, heldClaim, neededClaim } from './town-claim'
import type { TownSize } from './town-grid'
import type { TownPlan } from './town-plan'
import { distributedTown } from './distributed-town'
import type { WorldFootprint } from '../../../shared/office/world-document'

export const CLAIM_STORAGE_KEY = 'claudewatch.office.claim'
const STORAGE_VERSION = 1

export interface Town {
  plan: TownPlan
  // Lot id to the company that dresses it; a lot that is absent takes the floor's theme.
  owners: ReadonlyMap<string, string>
}

// What the city is laid over: the claim, held from floor to floor, and the owner's town size.
export type CampusTown = Pick<TownPlan, 'claim' | 'size'>

// `held` is the claim of the floor before, or null on a first start.
export function townOf(
  floor: FloorGeometry,
  held: Rect | null,
  size: TownSize = 'city'
): CampusTown {
  return { claim: campusClaim(neededClaim(floor), held), size }
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
  const { townSize } = useOfficeSettings()
  // undefined until storage has been read, which happens once.
  const heldRef = useRef<Rect | null | undefined>(undefined)
  const savedRef = useRef<string | null>(null)
  const town = useMemo(() => {
    if (heldRef.current === undefined) {
      heldRef.current = storedClaim(floor)
      savedRef.current = heldRef.current && claimKey(heldRef.current)
    }
    const next = townOf(floor, heldRef.current, townSize)
    heldRef.current = next.claim
    return distributedTown(next, protectedSites)
  }, [floor, townSize, protectedSites])
  const key = claimKey(town.plan.claim)
  useEffect(() => {
    if (key === savedRef.current) return
    savedRef.current = key
    writeStored(CLAIM_STORAGE_KEY, key)
  }, [key])
  return useMemo(
    () =>
      preview
        ? distributedTown(townOf(preview.floor, null, townSize), preview.protectedSites)
        : town,
    [preview, townSize, town]
  )
}
