import { dressCityDistrict } from '../themes/city-district-parts'
import type { PlacedLot } from '../themes/lot-kit'
import { draw } from '../themes/lot-math'
import { dressLot, type TownDress } from './town-dress'
import type { TownLot } from './town-lots'
import type { TownPlan } from './town-plan'
import { ZONE_HEIGHT_CAP_M } from './town-zones'

// The share of the city's filler lots each town size builds on; the rest lie open.
const BUILT_SHARE: Record<TownPlan['size'], number> = { village: 1 / 3, town: 2 / 3, city: 1 }
// A draw of the lot's own seed that no other pick takes.
const BUILT_DRAW = 90

// Filler lots queue by their own seed and a size builds the front of the queue, so the share
// holds on a small city and a lot built in a village stands in every larger town. Landmarks
// always build. The lots never change with size: the sim walks round the same ones.
export function builtLotIds({ lots, size }: Pick<TownPlan, 'lots' | 'size'>): Set<string> {
  const turnOf = (lot: TownLot): number => draw(lot.seed, BUILT_DRAW)
  const filler = lots
    .filter((lot) => !lot.isLandmark)
    .sort((a, b) => turnOf(a) - turnOf(b) || a.id.localeCompare(b.id))
  const built = filler.slice(0, Math.round(filler.length * BUILT_SHARE[size]))
  return new Set([...lots.filter((lot) => lot.isLandmark), ...built].map((lot) => lot.id))
}

// An open lot is the theme's garden laid across the whole lot, or bare ground without one.
function dressOpenLot(lot: TownLot, dress: TownDress): PlacedLot {
  const garden = dress.designs.filter((design) => design.name === dress.garden)
  const park: TownLot = {
    ...lot,
    zone: 'park',
    kind: 'building',
    maxHeight: Math.min(lot.maxHeight, ZONE_HEIGHT_CAP_M.park)
  }
  return { ...dressLot(park, 0, { ...dress, designs: garden }), lot }
}

// What the town draws on each of its lots at the owner's town size.
export function dressTown(plan: Pick<TownPlan, 'lots' | 'size'>, dress: TownDress): PlacedLot[] {
  const built = builtLotIds(plan)
  return plan.lots.map((lot) =>
    built.has(lot.id) ? dressCityDistrict(lot, dress) : dressOpenLot(lot, dress)
  )
}
