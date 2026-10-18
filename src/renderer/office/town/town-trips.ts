import type { CitizenRoute } from '../citizens/route-pose'
import type { QualityLevel } from '../logic/quality'
import { draw } from '../themes/lot-math'
import { citizenTrips } from './citizen-trips'
import type { VehicleRole } from './town-dress'
import type { TownSize } from './town-grid'
import type { TownPlan } from './town-plan'
import { vehicleTrips } from './vehicle-trips'

const DESTINATIONS = ['market', 'entertainment', 'park', 'plaza', 'civic'] as const
export type Destination = (typeof DESTINATIONS)[number]
export type MoverKind = 'citizen' | VehicleRole

export interface Trip {
  kind: MoverKind
  // Whose dress it wears, and which of that theme's figures of its kind it is.
  themeId: string
  figure: number
  route: CitizenRoute
  // Metres a second.
  speed: number
  // How far into its loop it is when the scene opens, so the town does not start at its doors.
  startSec: number
  // The lot it sets out from: a citizen's home, a freight vehicle's workshop.
  homeId: string | null
  destination: Destination | null
}

export interface TownInput {
  plan: TownPlan
  floorThemeId: string
  detail: QualityLevel
  hasVehicles?: boolean
}

// How many movers each detail level sends out, and how many instanced draws they may cost.
export const MOVER_COUNTS: Record<
  QualityLevel,
  { citizens: number; vehicles: number; citizenKinds: number; vehicleKinds: number }
> = {
  full: { citizens: 48, vehicles: 12, citizenKinds: 6, vehicleKinds: 4 },
  balanced: { citizens: 28, vehicles: 6, citizenKinds: 4, vehicleKinds: 2 },
  light: { citizens: 14, vehicles: 0, citizenKinds: 3, vehicleKinds: 0 }
}

// A smaller town sends out fewer of the same movers. Seven vehicles still reach the first
// freight cart, so a village keeps a tram, a cart and a runabout.
const SIZE_MOVERS: Record<TownSize, { citizenShare: number; vehicleCap: number }> = {
  village: { citizenShare: 0.5, vehicleCap: 7 },
  town: { citizenShare: 0.75, vehicleCap: 9 },
  city: { citizenShare: 1, vehicleCap: 12 }
}

// Where the town goes: the market most, then entertainment, a park, the gate plaza, civic.
const DESTINATION_SHARE: Record<Destination, number> = {
  market: 0.3,
  entertainment: 0.25,
  park: 0.2,
  plaza: 0.15,
  civic: 0.1
}

export function destinationOf(seed: number): Destination {
  let left = draw(seed, 0)
  for (const destination of DESTINATIONS) {
    left -= DESTINATION_SHARE[destination]
    if (left < 0) return destination
  }
  return 'civic'
}

// Everyone on the town's roads, citizens first. Pure: the same town gives the same trips, and a
// smaller level sends out the first of the same movers on the same routes.
export function townTrips(town: TownInput): Trip[] {
  const { citizens, vehicles } = MOVER_COUNTS[town.detail]
  const { citizenShare, vehicleCap } = SIZE_MOVERS[town.plan.size]
  const vehicleCount = town.hasVehicles === false ? 0 : Math.min(vehicles, vehicleCap)
  return [
    ...citizenTrips(town, Math.round(citizens * citizenShare)),
    ...vehicleTrips(town, vehicleCount)
  ]
}
