import type { CitizenRoute, RoutePoint } from '../citizens/route-pose'
import { boundsOfZone } from '../logic/zone-framing'
import { between, draw, grow, hashOf } from '../themes/lot-math'
import { reversed, roadNet, roadPath, type Leg, type RoadNet } from './road-net'
import type { VehicleRole } from './town-dress'
import { ROAD_WIDTH_M } from './town-grid'
import type { TownLot } from './town-lots'
import type { TownPlan } from './town-plan'
import { MOVER_COUNTS, themeOfLot, type TownInput, type Trip } from './town-trips'
import { KEEP_RIGHT_M, closedLoop, lengthOf, secondsAt, sidePath } from './trip-paths'

// The order vehicles are sent out in: a smaller level takes the first of them. The first six
// are the two kinds seen from anywhere, on the boulevard and the avenue.
const FLEET: readonly VehicleRole[] = [
  'transit',
  'runabout',
  'transit',
  'runabout',
  'transit',
  'runabout',
  'freight',
  'freight',
  'freight',
  'freight',
  'transit',
  'runabout'
]
const fleetOf = (role: VehicleRole): number => FLEET.filter((each) => each === role).length

// One speed to a line, so nothing on it catches up with the one ahead.
const TRANSIT_M_PER_SEC = 3.2
const RUNABOUT_M_PER_SEC = 3.8
const FREIGHT_M_PER_SEC = { min: 2.5, max: 3.4 }
const LOADING_SEC = { min: 6, max: 12 }
// A runabout turns this far inside the town's west edge, and this far into the gate plaza.
const AVENUE_END_M = 3
const PLAZA_TURN_M = 1
const FREIGHT_DRAWS = 6
const DRAW = { speed: 1, loading: 2, unloading: 3, start: 4, trip: 5 }

function ring(points: RoutePoint[]): CitizenRoute {
  const closed = [...points, points[0]]
  return { points: closed, length: lengthOf(closed), isLoop: true }
}

// Round the boulevard in its outer lane. Keeping right, that is north side westward: against
// the clock as the map is drawn.
function transitLoop(plan: TownPlan): CitizenRoute {
  const inset = ROAD_WIDTH_M.boulevard / 2 - KEEP_RIGHT_M.vehicle.boulevard
  const { minX, maxX, minZ, maxZ } = boundsOfZone(grow(plan.claim, -inset))
  return ring([
    { x: minX, z: minZ },
    { x: minX, z: maxZ },
    { x: maxX, z: maxZ },
    { x: maxX, z: minZ }
  ])
}

// The avenue from the gate plaza to its west end and back, each way on its own side.
function runaboutLoop(plan: TownPlan): CitizenRoute | null {
  const avenue = plan.roads.find((road) => road.class === 'avenue')
  if (!avenue) return null
  const west = Math.min(avenue.from.x, avenue.to.x) + AVENUE_END_M
  const east = Math.max(avenue.from.x, avenue.to.x) + PLAZA_TURN_M
  const keep = KEEP_RIGHT_M.vehicle.avenue
  return ring([
    { x: east, z: avenue.from.z - keep },
    { x: west, z: avenue.from.z - keep },
    { x: west, z: avenue.from.z + keep },
    { x: east, z: avenue.from.z + keep }
  ])
}

function cityVehicleLoop(options: {
  plan: TownPlan
  net: RoadNet
  role: 'transit' | 'runabout'
}): CitizenRoute | null {
  const { plan, net, role } = options
  const columns = [
    ...new Set(plan.roads.filter((road) => road.from.x === road.to.x).map((road) => road.from.x))
  ].sort((first, second) => first - second)
  const rows = [
    ...new Set(plan.roads.filter((road) => road.from.z === road.to.z).map((road) => road.from.z))
  ].sort((first, second) => first - second)
  const inset = role === 'runabout' && columns.length > 3 && rows.length > 3 ? 1 : 0
  const west = columns[inset],
    east = columns.at(-1 - inset)
  const north = rows[inset],
    south = rows.at(-1 - inset)
  if (west === undefined || east === undefined || north === undefined || south === undefined)
    return null
  const corners = [
    { x: west, z: north },
    { x: west, z: south },
    { x: east, z: south },
    { x: east, z: north }
  ]
  const legs: Leg[] = []
  for (const [index, from] of corners.entries()) {
    const route = roadPath(net, from, corners[(index + 1) % corners.length])
    if (!route?.length) return null
    legs.push(...route)
  }
  // Once more into the first leg, so the closing corner is joined like every other one.
  const points = sidePath([...legs, legs[0]], plan, 'vehicle').slice(1, -1)
  return points.length > 2 ? ring(points) : null
}

interface Yards {
  plan: TownPlan
  net: RoadNet
  workshops: TownLot[]
  markets: TownLot[]
}

// From a workshop's kerb to a market's and back, with a pause to load and one to unload.
function freightRun(yards: Yards, seed: number): { workshop: TownLot; route: CitizenRoute } | null {
  const { plan, net, workshops, markets } = yards
  if (workshops.length === 0 || markets.length === 0) return null
  for (let attempt = 0; attempt < FREIGHT_DRAWS; attempt++) {
    const workshop = workshops[Math.floor(draw(seed, DRAW.trip + attempt * 2) * workshops.length)]
    const market = markets[Math.floor(draw(seed, DRAW.trip + attempt * 2 + 1) * markets.length)]
    const legs = roadPath(net, workshop.door, market.door)
    if (!legs || legs.length === 0) continue
    const route = closedLoop(
      sidePath(legs, plan, 'vehicle'),
      sidePath(reversed(legs), plan, 'vehicle'),
      { sec: between(LOADING_SEC, draw(seed, DRAW.unloading)), isIndoors: false },
      { sec: between(LOADING_SEC, draw(seed, DRAW.loading)), isIndoors: false }
    )
    return { workshop, route }
  }
  return null
}

// The first `count` of the town's vehicles. Transit and runabouts wear the floor's theme;
// freight wears the theme that owns its workshop, while there is a draw left for it.
export function vehicleTrips(town: TownInput, count: number): Trip[] {
  const { plan, floorThemeId } = town
  const sorted = [...plan.lots].sort((a, b) => a.id.localeCompare(b.id))
  const yards: Yards = {
    plan,
    net: roadNet(plan, 'vehicle'),
    workshops: sorted.filter((lot) => lot.zone === 'workshop'),
    markets: sorted.filter((lot) => lot.zone === 'market')
  }
  const lines = plan.officeSites
    ? {
        transit: cityVehicleLoop({ plan, net: yards.net, role: 'transit' }),
        runabout: cityVehicleLoop({ plan, net: yards.net, role: 'runabout' })
      }
    : { transit: transitLoop(plan), runabout: runaboutLoop(plan) }
  const speeds = { transit: TRANSIT_M_PER_SEC, runabout: RUNABOUT_M_PER_SEC }
  // Transit and runabouts take a draw each; what is left goes to freight, one a theme.
  // Overflow freight uses the floor's vehicle, so its draw must be reserved too.
  const freightThemes = new Set<string>([floorThemeId])
  const freightBudget = MOVER_COUNTS[town.detail].vehicleKinds - 2
  const sent: Record<VehicleRole, number> = { transit: 0, runabout: 0, freight: 0 }

  return FLEET.slice(0, count).flatMap((role): Trip[] => {
    const nth = sent[role]++
    if (role !== 'freight') {
      const route = lines[role]
      if (!route) return []
      const speed = speeds[role]
      // Spread evenly round the line.
      const startSec = secondsAt(route, speed, nth / fleetOf(role))
      return [
        {
          kind: role,
          themeId: floorThemeId,
          figure: 0,
          route,
          speed,
          startSec,
          homeId: null,
          destination: null
        }
      ]
    }
    const seed = hashOf(`freight:${nth}`)
    const run = freightRun(yards, seed)
    if (!run) return []
    const owner = themeOfLot(town, run.workshop.id)
    if (freightThemes.size < freightBudget) freightThemes.add(owner)
    const speed = between(FREIGHT_M_PER_SEC, draw(seed, DRAW.speed))
    return [
      {
        kind: 'freight',
        themeId: freightThemes.has(owner) ? owner : floorThemeId,
        figure: 0,
        route: run.route,
        speed,
        startSec: secondsAt(run.route, speed, draw(seed, DRAW.start)),
        homeId: run.workshop.id,
        destination: 'market'
      }
    ]
  })
}
