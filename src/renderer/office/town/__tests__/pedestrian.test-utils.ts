import {
  LIVE_OFFICES,
  liveVenueSites
} from '../../../../shared/office/__tests__/live-city-streets.test-utils'
import type { RoutePoint } from '../../citizens/route-pose'
import { groundEnvelope } from '../../scene/all-floor-model'
import type { FloorGeometry } from '../../scene-model'
import type { Rect } from '../../themes/lot-math'
import { EDO } from '../../themes/palettes'
import { makeFloor } from '../../__tests__/fixtures'
import { distributedTown } from '../distributed-town'
import { fallbackDress } from '../fallback-dress'
import { groundQuads } from '../town-ground'
import type { TownPlan } from '../town-plan'
import { townTrips, type Trip } from '../town-trips'
import { townOf } from '../use-town-plan'

const SAMPLE_M = 0.25

export interface Scenario {
  plan: TownPlan
  trips: Trip[]
  floor: FloorGeometry
}

export function liveCity(): Scenario {
  const floors = LIVE_OFFICES.map(([x, z, width, depth, entranceZ], index) =>
    makeFloor({
      floorId: `live-${index}`,
      buildingId: `live-building-${index}`,
      x,
      z,
      width,
      depth,
      elevation: 0,
      entrance: { x, z: entranceZ }
    })
  )
  const floor = groundEnvelope(floors, floors[0])
  const town = distributedTown(townOf(floor, null, 'full', 'city'), [
    ...floors,
    ...liveVenueSites()
  ])
  const trips = townTrips({
    plan: town.plan,
    owners: town.owners,
    floorThemeId: 'corporate-city',
    themeIdByZone: new Map(),
    detail: 'full',
    hasVehicles: true
  })
  return { plan: town.plan, trips, floor }
}

export const within = (rect: Rect, point: RoutePoint): boolean =>
  Math.abs(point.x - rect.x) < rect.width / 2 - 1e-6 &&
  Math.abs(point.z - rect.z) < rect.depth / 2 - 1e-6

// `junction`: inside two carriageways; `mouth`: crossing a road inside a cross street's footprint.
type Spot = 'kerb' | 'zebra' | 'junction' | 'mouth' | 'mid-block'
export const isAsphalt = (spot: Spot): boolean => spot !== 'kerb' && spot !== 'zebra'

// The asphalt the town paints, less promenades laid over it and its painted zebra crossings.
export function roadSurface(plan: TownPlan): (point: RoutePoint) => Spot {
  const quads = groundQuads(plan, fallbackDress(EDO))
  const driven = plan.roads.filter((road) => road.class !== 'lane')
  const carriageways = quads
    .filter((quad) => quad.layer === 'carriageway')
    .map((rect, index) => ({ rect, isAlongX: driven[index].from.z === driven[index].to.z }))
  const footprints = quads
    .filter((quad) => quad.layer === 'sidewalk')
    .map((rect, index) => ({ rect, isAlongX: plan.roads[index].from.z === plan.roads[index].to.z }))
  const promenades = quads.filter((quad) => quad.layer === 'promenade')
  const isStripe = (quad: Rect): boolean =>
    (Math.abs(quad.width - 3) < 1e-6 && Math.abs(quad.depth - 0.42) < 1e-6) ||
    (Math.abs(quad.depth - 3) < 1e-6 && Math.abs(quad.width - 0.42) < 1e-6)
  const zebras = new Map<string, Rect>()
  for (const stripe of quads.filter((quad) => quad.layer === 'marking' && isStripe(quad))) {
    const road = carriageways.find((each) => within(each.rect, stripe))
    if (!road) continue
    const zone = road.isAlongX
      ? { x: stripe.x, width: 3, z: road.rect.z, depth: road.rect.depth }
      : { z: stripe.z, depth: 3, x: road.rect.x, width: road.rect.width }
    zebras.set(`${zone.x}:${zone.z}`, zone)
  }
  return (point) => {
    const under = carriageways.filter((road) => within(road.rect, point))
    if (under.length === 0 || promenades.some((rect) => within(rect, point))) return 'kerb'
    if ([...zebras.values()].some((rect) => within(rect, point))) return 'zebra'
    const isJunction = under.some((road) => road.isAlongX) && under.some((road) => !road.isAlongX)
    if (isJunction) return 'junction'
    const isMouth = footprints.some(
      (road) => road.isAlongX !== under[0].isAlongX && within(road.rect, point)
    )
    return isMouth ? 'mouth' : 'mid-block'
  }
}

type Part = 'leave-home' | 'out' | 'arrive' | 'leave-goal' | 'back' | 'arrive-home'

// closedLoop's points are [door, ...out, goal, ...back, door]; the away stop marks the goal.
export function partsOf(trip: Trip): { from: RoutePoint; to: RoutePoint; part: Part }[] {
  const { points, stops = [] } = trip.route
  let at = 0
  let goal = -1
  for (let index = 1; index < points.length && goal < 0; index++) {
    at += Math.hypot(points[index].x - points[index - 1].x, points[index].z - points[index - 1].z)
    if (Math.abs(at - (stops[0]?.at ?? -1)) < 1e-6) goal = index
  }
  return points.slice(1).map((to, index) => {
    const part: Part =
      index === 0
        ? 'leave-home'
        : index === points.length - 2
          ? 'arrive-home'
          : index === goal - 1
            ? 'arrive'
            : index === goal
              ? 'leave-goal'
              : index < goal
                ? 'out'
                : 'back'
    return { from: points[index], to, part }
  })
}

export function samplesOf(from: RoutePoint, to: RoutePoint): RoutePoint[] {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / SAMPLE_M))
  return Array.from({ length: steps }, (_, step) => ({
    x: from.x + ((to.x - from.x) * step) / steps,
    z: from.z + ((to.z - from.z) * step) / steps
  }))
}

// The signed offset of a mid-block stretch from the centre line of the one street it runs
// along; corners and junction joins give null.
export function streetOffset(
  plan: TownPlan,
  from: RoutePoint,
  to: RoutePoint
): { roadId: string; offset: number } | null {
  const isAlongX = Math.abs(from.z - to.z) < 1e-6
  if (!isAlongX && Math.abs(from.x - to.x) > 1e-6) return null
  if (Math.hypot(to.x - from.x, to.z - from.z) < 2) return null
  const middle = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 }
  const under = plan.roads.filter((road) =>
    within(
      {
        x: (road.from.x + road.to.x) / 2,
        z: (road.from.z + road.to.z) / 2,
        width: Math.abs(road.to.x - road.from.x) || road.width,
        depth: Math.abs(road.to.z - road.from.z) || road.width
      },
      middle
    )
  )
  if (under.length !== 1 || (under[0].from.z === under[0].to.z) !== isAlongX) return null
  const [road] = under
  return { roadId: road.id, offset: isAlongX ? middle.z - road.from.z : middle.x - road.from.x }
}
