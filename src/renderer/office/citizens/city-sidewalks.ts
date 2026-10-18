import { crosswalks, type Crosswalk } from '../../../shared/office/crosswalks'
import {
  ambientLoops,
  attachDoor,
  pedestrianGround,
  sidewalkNetwork,
  type SidewalkNetwork
} from '../../../shared/office/sidewalks'
import type { WorldPoint } from '../../../shared/office/world-document-types'
import type { WalkGround } from '../player/walk-ground'
import type { TownPlan } from '../town/town-plan'

export interface CitySidewalks {
  network: SidewalkNetwork
  crossings: readonly Crosswalk[]
  // One closed, one-way walk round each block.
  loops: readonly (readonly WorldPoint[])[]
}

const built = new WeakMap<TownPlan, CitySidewalks>()

// A city's walks, built once per plan with every lot door on them. Doors attach in id order, so
// node ids never depend on which trip asked first.
export function citySidewalks(plan: TownPlan): CitySidewalks {
  const known = built.get(plan)
  if (known) return known
  const crossings = crosswalks(plan.roads)
  const network = sidewalkNetwork(plan.roads, crossings)
  for (const lot of [...plan.lots].sort((a, b) => a.id.localeCompare(b.id)))
    attachDoor(network, lot.door)
  const sidewalks = { network, crossings, loops: ambientLoops(network) }
  built.set(plan, sidewalks)
  return sidewalks
}

// Where citizens may stand: off every carriageway but its zebras (citizens-5).
export function citizenGround(plan: TownPlan): WalkGround {
  return pedestrianGround(citySidewalks(plan).network, plan.extent, [
    ...plan.lots,
    ...plan.officeSites
  ])
}
