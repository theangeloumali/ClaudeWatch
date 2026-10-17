import type { PlacedLot } from '../themes/lot-kit'
import { dressCityDistrict } from '../themes/city-district-parts'
import { getTheme } from '../themes/registry'
import type { FloorGeometry } from '../scene-model'
import { distributedTown } from './distributed-town'
import type { TownDress } from './town-dress'
import { townOf } from './use-town-plan'

export function townDressOf(themeId: string): TownDress {
  const dress = getTheme(themeId).town
  if (!dress) throw new Error(`${themeId} has no town`)
  return dress
}

// Every lot of a first start's city at full detail, as TownView draws it in one theme.
export function drawnTown(themeId: string, floor: FloorGeometry): PlacedLot[] {
  const { plan } = distributedTown(townOf(floor, null, 'full'), [floor])
  return plan.lots.map((lot) => dressCityDistrict(lot, townDressOf(themeId)))
}
