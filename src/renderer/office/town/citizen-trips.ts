import type { Point } from '../../../office/sim/path'
import { attachDoor, sidewalkPath, type SidewalkNetwork } from '../../../shared/office/sidewalks'
import { citySidewalks } from '../citizens/city-sidewalks'
import type { CitizenRoute, RoutePoint } from '../citizens/route-pose'
import { between, draw, hashOf, type Rect } from '../themes/lot-math'
import { streetFootprint } from './distributed-town'
import type { TownLot } from './town-lots'
import type { TownPlan } from './town-plan'
import {
  MOVER_COUNTS,
  destinationOf,
  type Destination,
  type TownInput,
  type Trip
} from './town-trips'
import { closedLoop, lengthOf, secondsAt } from './trip-paths'

const STROLL_M_PER_SEC = { min: 0.6, max: 1.2 }
const AWAY_SEC = { min: 8, max: 20 }
const HOME_SEC = { min: 4, max: 10 }
// No theme shows more of its figures than this, however much of the budget is free.
const FIGURES_PER_THEME = 4

// A citizen draws a home and somewhere to go this many times at most, and keeps the first pair
// whose walk is this much in the open; failing that, the most open of them.
const TRIP_DRAWS = 12
const OPEN_SHARE_WANTED = 0.75
const OPEN_SAMPLE_M = 0.5

// The draws a citizen's seed is spent on. Each try at a trip takes two from TRIP on; a
// stroller's one draw of a loop takes TRIP.
const DRAW = { speed: 1, away: 2, home: 3, start: 4, trip: 5 }

// Every fourth city citizen strolls a block's sidewalks instead of going somewhere: busy streets
// with no crossing risk (citizens-8). Chosen by index, so a lighter level keeps the same ones.
const STROLLER_EVERY = 4
const isStroller = (index: number): boolean => index % STROLLER_EVERY === STROLLER_EVERY - 1
const drawIndex = (seed: number, of: readonly unknown[]): number =>
  Math.floor(draw(seed, DRAW.trip) * of.length)

interface OutAndBack {
  out: RoutePoint[]
  back: RoutePoint[]
}

interface Ground {
  network: SidewalkNetwork
  homes: TownLot[]
  lotsOf: Record<Exclude<Destination, 'plaza'>, TownLot[]>
  // Where a citizen is in plain sight: the promenades and the parks.
  open: Rect[]
  // A plaza-bound citizen's stand: the door of a park, a market or a civic lot.
  plazaStands: Point[]
}

// On the city's one-way sidewalks, crossing only on its zebras (citizens-3, -4).
function sidewalkWalk(network: SidewalkNetwork, door: Point, goal: Point): OutAndBack | null {
  const [home, away] = [attachDoor(network, door), attachDoor(network, goal)]
  const out = sidewalkPath(network, home, away)
  const back = sidewalkPath(network, away, home)
  if (!out || !back || out.length < 2) return null
  // closedLoop adds the door again, and `out` already ends on the goal.
  return { out: [...out], back: back.slice(1, -1) }
}

// A lot whose street an office cut short has no kerb at its door: no one is sent there.
function opensOnStreet(plan: TownPlan): (lot: TownLot) => boolean {
  const streets = plan.roads.map(streetFootprint)
  return ({ door }) =>
    streets.some(
      (street) =>
        Math.abs(door.x - street.x) <= street.width / 2 &&
        Math.abs(door.z - street.z) <= street.depth / 2
    )
}

function groundOf(plan: TownPlan): Ground {
  const sorted = plan.lots.filter(opensOnStreet(plan)).sort((a, b) => a.id.localeCompare(b.id))
  const inZone = (zone: TownLot['zone']): TownLot[] => sorted.filter((lot) => lot.zone === zone)
  return {
    network: citySidewalks(plan).network,
    homes: inZone('residential'),
    lotsOf: {
      market: inZone('market'),
      entertainment: inZone('entertainment'),
      park: inZone('park'),
      civic: inZone('civic')
    },
    open: [...plan.promenades, ...inZone('park')],
    plazaStands: sorted
      .filter((lot) => lot.zone === 'park' || lot.zone === 'market' || lot.zone === 'civic')
      .map((lot) => lot.door)
  }
}

// Where a citizen bound for `destination` ends up: a lot's door, or a plaza stand.
function goalOf(ground: Ground, destination: Destination, pick: number): Point {
  const stand =
    ground.plazaStands[Math.floor(pick * ground.plazaStands.length)] ?? ground.homes[0].door
  if (destination === 'plaza') return stand
  const lots = ground.lotsOf[destination]
  if (lots.length === 0) return stand
  return lots[Math.floor(pick * lots.length)].door
}

function openShare(points: readonly RoutePoint[], open: readonly Rect[]): number {
  let inTheOpen = 0
  let samples = 0
  for (let index = 1; index < points.length; index++) {
    const [from, to] = [points[index - 1], points[index]]
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / OPEN_SAMPLE_M)
    for (let step = 0; step < steps; step++) {
      const x = from.x + ((to.x - from.x) * step) / steps
      const z = from.z + ((to.z - from.z) * step) / steps
      samples++
      if (
        open.some(
          (rect) => Math.abs(x - rect.x) <= rect.width / 2 && Math.abs(z - rect.z) <= rect.depth / 2
        )
      )
        inTheOpen++
    }
  }
  return samples === 0 ? 0 : inTheOpen / samples
}

interface Walk {
  home: TownLot
  out: RoutePoint[]
  back: RoutePoint[]
  openShare: number
}

function walkBetween(ground: Ground, home: TownLot, goal: Point): Walk | null {
  const walk = sidewalkWalk(ground.network, home.door, goal)
  if (!walk) return null
  const { out, back } = walk
  return { home, out, back, openShare: openShare([...out, ...back, home.door], ground.open) }
}

function walkOf(ground: Ground, seed: number, destination: Destination): Walk | null {
  let best: Walk | null = null
  for (let attempt = 0; attempt < TRIP_DRAWS; attempt++) {
    const home = ground.homes[Math.floor(draw(seed, DRAW.trip + attempt * 2) * ground.homes.length)]
    const goal = goalOf(ground, destination, draw(seed, DRAW.trip + attempt * 2 + 1))
    const walk = walkBetween(ground, home, goal)
    if (walk && walk.openShare >= OPEN_SHARE_WANTED) return walk
    if (walk && walk.openShare > (best?.openShare ?? -1)) best = walk
  }
  return best
}

// Citizen `n` of the town: it lives at a residential lot, walks to where its seed sends it by
// the cheapest way that keeps it in sight, waits, and walks home on the other side of the road.
export function citizenTrips(town: TownInput, count: number): Trip[] {
  const ground = groundOf(town.plan)
  if (ground.homes.length === 0) return []
  const { loops } = citySidewalks(town.plan)
  const walked = Array.from({ length: count }, (_, index) => {
    const seed = hashOf(`citizen:${index}`)
    const destination = destinationOf(seed)
    const loop = loops.length > 0 && isStroller(index) ? loops[drawIndex(seed, loops)] : null
    return { seed, destination, loop, walk: loop ? null : walkOf(ground, seed, destination) }
  })
  // Every citizen wears the floor's townsfolk, as many figures as the draw budget allows.
  const budget = MOVER_COUNTS[town.detail].citizenKinds
  const slots = Math.max(1, Math.min(FIGURES_PER_THEME, budget))
  let rank = 0

  return walked.flatMap(({ seed, destination, loop, walk }): Trip[] => {
    if (!loop && !walk) return []
    const speed = between(STROLL_M_PER_SEC, draw(seed, DRAW.speed))
    const route = walk ? tripRoute(walk, seed, destination) : strollRoute(loop ?? [])
    return [
      {
        kind: 'citizen',
        themeId: town.floorThemeId,
        figure: rank++ % slots,
        route,
        speed,
        startSec: secondsAt(route, speed, draw(seed, DRAW.start)),
        homeId: walk?.home.id ?? null,
        destination: walk ? destination : null
      }
    ]
  })
}

// Out to the destination and home again, waiting at each end.
function tripRoute(walk: Walk, seed: number, destination: Destination): CitizenRoute {
  const isOutdoors = destination === 'park' || destination === 'plaza'
  return closedLoop(
    walk.out,
    walk.back,
    { sec: between(AWAY_SEC, draw(seed, DRAW.away)), isIndoors: !isOutdoors },
    { sec: between(HOME_SEC, draw(seed, DRAW.home)), isIndoors: true }
  )
}

// Round and round one block, never stopping and never crossing a street.
const strollRoute = (loop: readonly RoutePoint[]): CitizenRoute => ({
  points: [...loop],
  length: lengthOf(loop),
  isLoop: true
})
