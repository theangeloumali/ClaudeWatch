import type { Crosswalk } from '../../../shared/office/crosswalks'
import type { WorldFootprint } from '../../../shared/office/world-document-types'
import type { CitizenRoute, RoutePoint } from '../citizens/route-pose'
import { between, draw, hashOf } from '../themes/lot-math'
import { reversed, roadNet, roadPath, type Leg, type RoadNet } from './road-net'
import type { VehicleRole } from './town-dress'
import { lotsWithDoors, type DooredLot } from './town-lots'
import type { TownPlan } from './town-plan'
import { type TownInput, type Trip } from './town-trips'
import { closedLoop, lengthOf, secondsAt, sidePath } from './trip-paths'

// The order vehicles are sent out in: a smaller level takes the first of them. The first six
// are the two kinds that ring the city, seen from anywhere.
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
const FREIGHT_DRAWS = 6
const DRAW = { speed: 1, loading: 2, unloading: 3, start: 4, trip: 5 }

function ring(points: RoutePoint[]): CitizenRoute {
  const closed = [...points, points[0]]
  return { points: closed, length: lengthOf(closed), isLoop: true }
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
  const points = sidePath([...legs, legs[0]]).slice(1, -1)
  return points.length > 2 ? ring(points) : null
}

interface Yards {
  net: RoadNet
  workshops: DooredLot[]
  markets: DooredLot[]
}

// From a workshop's kerb to a market's and back, with a pause to load and one to unload.
function freightRun(
  yards: Yards,
  seed: number
): { workshop: DooredLot; route: CitizenRoute } | null {
  const { net, workshops, markets } = yards
  if (workshops.length === 0 || markets.length === 0) return null
  for (let attempt = 0; attempt < FREIGHT_DRAWS; attempt++) {
    const workshop = workshops[Math.floor(draw(seed, DRAW.trip + attempt * 2) * workshops.length)]
    const market = markets[Math.floor(draw(seed, DRAW.trip + attempt * 2 + 1) * markets.length)]
    const legs = roadPath(net, workshop.door, market.door)
    if (!legs || legs.length === 0) continue
    const route = closedLoop(
      sidePath(legs),
      sidePath(reversed(legs)),
      { sec: between(LOADING_SEC, draw(seed, DRAW.unloading)), isIndoors: false },
      { sec: between(LOADING_SEC, draw(seed, DRAW.loading)), isIndoors: false }
    )
    return { workshop, route }
  }
  return null
}

// The first `count` of the town's vehicles, every one in the floor's theme.
export function vehicleTrips(town: TownInput, count: number): Trip[] {
  const { plan, floorThemeId } = town
  const sorted = lotsWithDoors(plan.lots)
  const yards: Yards = {
    net: roadNet(plan),
    workshops: sorted.filter((lot) => lot.zone === 'workshop'),
    markets: sorted.filter((lot) => lot.zone === 'market')
  }
  const lines = {
    transit: cityVehicleLoop({ plan, net: yards.net, role: 'transit' }),
    runabout: cityVehicleLoop({ plan, net: yards.net, role: 'runabout' })
  }
  const speeds = { transit: TRANSIT_M_PER_SEC, runabout: RUNABOUT_M_PER_SEC }
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
    const speed = between(FREIGHT_M_PER_SEC, draw(seed, DRAW.speed))
    return [
      {
        kind: 'freight',
        themeId: floorThemeId,
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

const EPSILON_M = 1e-6

// Where a vehicle's route crosses one zebra, in metres along it: its front holds at `holdAt`,
// the zebra's stop line, and its route leaves the band at `clearAt`.
export interface ZebraPass {
  zebra: number
  holdAt: number
  clearAt: number
}

// The share of `from`→`to` strictly inside `rect`, or null (Liang–Barsky).
function spanInside(
  from: RoutePoint,
  to: RoutePoint,
  rect: WorldFootprint
): [number, number] | null {
  let [low, high] = [0, 1]
  const sides = [
    [from.x - to.x, from.x - (rect.x - rect.width / 2)],
    [to.x - from.x, rect.x + rect.width / 2 - from.x],
    [from.z - to.z, from.z - (rect.z - rect.depth / 2)],
    [to.z - from.z, rect.z + rect.depth / 2 - from.z]
  ]
  for (const [toward, room] of sides) {
    if (Math.abs(toward) < EPSILON_M) {
      if (room < EPSILON_M) return null
      continue
    }
    if (toward < 0) low = Math.max(low, room / toward)
    else high = Math.min(high, room / toward)
  }
  return high - low > EPSILON_M ? [low, high] : null
}

// A crosswalk's setback: from its stop line to the near edge of its band.
function stopGapOf(crossing: Crosswalk, zebra: WorldFootprint): number {
  const [line] = crossing.stopLines
  return crossing.axis === 'z'
    ? Math.abs(line.x - zebra.x) - zebra.width / 2
    : Math.abs(line.z - zebra.z) - zebra.depth / 2
}

// Every zebra a vehicle's route drives over, turn-outs included, as stop-line events from
// crosswalks() (P6b). `zebras` are the crossings' painted bands, in the same order.
export function zebraPasses(
  route: CitizenRoute,
  crossings: readonly Crosswalk[],
  zebras: readonly WorldFootprint[]
): ZebraPass[] {
  const passes: ZebraPass[] = []
  let start = 0
  route.points.slice(1).forEach((to, index) => {
    const from = route.points[index]
    const length = Math.hypot(to.x - from.x, to.z - from.z)
    zebras.forEach((zebra, zebraIndex) => {
      const span = spanInside(from, to, zebra)
      if (!span) return
      const [enter, leave] = [start + span[0] * length, start + span[1] * length]
      const ongoing = passes.findIndex(
        (pass) => pass.zebra === zebraIndex && Math.abs(pass.clearAt - enter) < EPSILON_M
      )
      if (ongoing >= 0) passes[ongoing] = { ...passes[ongoing], clearAt: leave }
      else
        passes.push({
          zebra: zebraIndex,
          holdAt: enter - stopGapOf(crossings[zebraIndex], zebra),
          clearAt: leave
        })
    })
    start += length
  })
  return passes
}
