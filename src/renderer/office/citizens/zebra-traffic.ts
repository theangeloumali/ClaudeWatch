import type { Crosswalk } from '../../../shared/office/crosswalks'
import type { WorldFootprint } from '../../../shared/office/world-document-types'
import type { MoverKind, Trip } from '../town/town-trips'
import { zebraPasses, type ZebraPass } from '../town/vehicle-trips'
import type { CitySidewalks } from './city-sidewalks'
import { loopMetres, routePose, type RoutePoint } from './route-pose'

// How far ahead of its middle a vehicle's front is; its back is as far behind.
export const NOSE_M: Record<Exclude<MoverKind, 'citizen'>, number> = {
  transit: 3,
  freight: 2,
  runabout: 1.4
}
// Someone this near a zebra, off its kerb end, is about to cross it.
const WALKER_REACH_M = 1
// How near the player a vehicle's front stops.
const PLAYER_HOLD_M = 1.4
const EPSILON_M = 1e-6

// A city's zebras and where each vehicle's loop drives over them.
export interface ZebraTraffic {
  crossings: readonly Crosswalk[]
  // Their painted bands, in the same order.
  zebras: readonly WorldFootprint[]
  // Per trip; a citizen's are empty.
  passes: readonly (readonly ZebraPass[])[]
}

export function zebraTraffic(trips: readonly Trip[], sidewalks: CitySidewalks): ZebraTraffic {
  return {
    crossings: sidewalks.crossings,
    zebras: sidewalks.network.zebras,
    passes: trips.map((trip) => tripPasses(trip, sidewalks))
  }
}

// Where one trip drives over the zebras: an ambient loop, or a work trip swapped into its slot.
export function tripPasses(trip: Trip, sidewalks: CitySidewalks): ZebraPass[] {
  return trip.kind === 'citizen' || !trip.route.isLoop
    ? []
    : zebraPasses(trip.route, sidewalks.crossings, sidewalks.network.zebras)
}

const isInside = (rect: WorldFootprint, point: RoutePoint): boolean =>
  Math.abs(point.x - rect.x) < rect.width / 2 && Math.abs(point.z - rect.z) < rect.depth / 2

// The zebras someone on foot is on, or about to step onto from its kerb.
export function zebrasInUse(
  traffic: ZebraTraffic,
  walkers: readonly RoutePoint[]
): ReadonlySet<number> {
  const inUse = new Set<number>()
  traffic.zebras.forEach((zebra, index) => {
    const isAcrossX = traffic.crossings[index].axis === 'x'
    const landing = {
      ...zebra,
      width: zebra.width + (isAcrossX ? 2 * WALKER_REACH_M : 0),
      depth: zebra.depth + (isAcrossX ? 0 : 2 * WALKER_REACH_M)
    }
    if (walkers.some((walker) => isInside(landing, walker))) inUse.add(index)
  })
  return inUse
}

// A vehicle's front, in metres round its loop.
function frontOf(trip: Trip, walked: number): number {
  const nose = trip.kind === 'citizen' ? 0 : NOSE_M[trip.kind]
  return loopMetres(trip.route, walked * trip.speed, trip.speed) + nose
}

// The same place on a loop a lap either way, for fronts that run past its end.
const lapsOf = (at: number, length: number): number[] => [at - length, at, at + length]

// The zebras a vehicle is committed to: its front past the stop line, its back not yet off.
export function zebrasCrossed(
  traffic: ZebraTraffic,
  trips: readonly Trip[],
  moved: Float64Array
): ReadonlySet<number> {
  const crossed = new Set<number>()
  trips.forEach((trip, index) => {
    if (trip.kind === 'citizen') return
    const front = frontOf(trip, moved[index])
    const bodyLength = 2 * NOSE_M[trip.kind]
    for (const pass of traffic.passes[index])
      if (
        lapsOf(0, trip.route.length).some(
          (lap) => front > pass.holdAt + lap + EPSILON_M && front < pass.clearAt + bodyLength + lap
        )
      )
        crossed.add(pass.zebra)
  })
  return crossed
}

// The player walks anywhere, so a vehicle stops short of it mid-block too, not only at zebras.
export function isHeldByPlayer(
  trip: Trip,
  walked: number,
  deltaSec: number,
  player: RoutePoint
): boolean {
  if (trip.kind === 'citizen') return false
  const front = routePose(
    trip.route,
    (walked + deltaSec) * trip.speed + NOSE_M[trip.kind],
    trip.speed
  )
  return Math.hypot(front.x - player.x, front.z - player.z) < PLAYER_HOLD_M
}

// Whether a vehicle's next step would carry its front over the stop line of a zebra in use.
export function isHeldAtZebra(options: {
  traffic: ZebraTraffic
  trip: Trip
  index: number
  walked: number
  deltaSec: number
  inUse: ReadonlySet<number>
}): boolean {
  const { traffic, trip, index, walked, deltaSec, inUse } = options
  const front = frontOf(trip, walked)
  let next = frontOf(trip, walked + deltaSec)
  if (next < front - EPSILON_M) next += trip.route.length
  return traffic.passes[index].some(
    (pass) =>
      inUse.has(pass.zebra) &&
      lapsOf(pass.holdAt, trip.route.length).some(
        (holdAt) => front <= holdAt + EPSILON_M && next > holdAt
      )
  )
}

// Whether a step takes a walker from its kerb onto a zebra a vehicle is driving over.
export function entersCrossedZebra(
  traffic: ZebraTraffic,
  crossed: ReadonlySet<number>,
  from: RoutePoint,
  to: RoutePoint
): boolean {
  return [...crossed].some(
    (index) => isInside(traffic.zebras[index], to) && !isInside(traffic.zebras[index], from)
  )
}
