import { crosswalks, type Crosswalk } from '../../../shared/office/crosswalks'
import {
  attachDoor,
  pedestrianGround,
  sidewalkNetwork,
  type SidewalkNetwork
} from '../../../shared/office/sidewalks'
import { walkGround, type WalkGround } from '../player/walk-ground'
import type { FloorGeometry } from '../scene-model'
import type { TownPlan } from '../town/town-plan'

export interface CitySidewalks {
  network: SidewalkNetwork
  crossings: readonly Crosswalk[]
}

const built = new WeakMap<TownPlan, CitySidewalks>()

// A city's walks, built once per plan with every lot door on them; the campus town has none.
// Doors attach in id order, so node ids never depend on which trip asked first.
export function citySidewalks(plan: TownPlan): CitySidewalks | null {
  if (!plan.officeSites) return null
  const known = built.get(plan)
  if (known) return known
  const crossings = crosswalks(plan.roads)
  const network = sidewalkNetwork(plan.roads, crossings)
  for (const lot of [...plan.lots].sort((a, b) => a.id.localeCompare(b.id)))
    attachDoor(network, lot.door)
  const sidewalks = { network, crossings }
  built.set(plan, sidewalks)
  return sidewalks
}

// Where citizens may stand: in a city, off every carriageway but its zebras (citizens-5).
export function citizenGround(floor: FloorGeometry, plan: TownPlan): WalkGround {
  const sidewalks = citySidewalks(plan)
  if (!sidewalks) return walkGround(floor, plan.lots, plan.extent)
  return pedestrianGround(sidewalks.network, plan.extent, [
    ...plan.lots,
    ...(plan.officeSites ?? [])
  ])
}
