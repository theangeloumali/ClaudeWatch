import type { Point } from '../../../office/sim/path'
import type { CitizenRoute, RoutePoint } from '../citizens/route-pose'
import type { Rect } from '../themes/lot-math'
import type { Leg, Traveller } from './road-net'
import { AVENUE_MEDIAN_M, ROAD_WIDTH_M, SIDEWALK_M } from './town-grid'
import type { RoadClass } from './town-roads'
import type { TownPlan } from './town-plan'

const carriageway = (road: Exclude<RoadClass, 'lane'>): number =>
  ROAD_WIDTH_M[road] / 2 - SIDEWALK_M[road]

// How far to the right of a road's centre line each traveller keeps.
export const KEEP_RIGHT_M: Record<Traveller, Record<RoadClass, number>> = {
  citizen: {
    // On the median, and on the boulevard's inner sidewalk (see INNER_SIDEWALK_M).
    avenue: AVENUE_MEDIAN_M / 4,
    boulevard: SIDEWALK_M.boulevard / 4,
    collector: ROAD_WIDTH_M.collector / 2 - SIDEWALK_M.collector / 2,
    lane: ROAD_WIDTH_M.lane / 4
  },
  vehicle: {
    avenue: (AVENUE_MEDIAN_M / 2 + carriageway('avenue')) / 2,
    boulevard: carriageway('boulevard') / 2,
    collector: carriageway('collector') / 2,
    lane: 0
  }
}
// The middle of the boulevard's inner sidewalk, from its centre line: the promenade.
const INNER_SIDEWALK_M = ROAD_WIDTH_M.boulevard / 2 - SIDEWALK_M.boulevard / 2

// Where a traveller is beside a leg's centre line: to the right of the way it is going, and for
// a citizen on the boulevard, over on the sidewalk next to the campus.
function besideOf(
  leg: Leg,
  context: Rect | Pick<TownPlan, 'claim' | 'officeSites'>,
  traveller: Traveller
): Point {
  const claim = 'claim' in context ? context.claim : context
  const isCity = 'claim' in context && Boolean(context.officeSites)
  const ahead = { x: Math.sign(leg.to.x - leg.from.x), z: Math.sign(leg.to.z - leg.from.z) }
  const halfWidth = (leg.width ?? ROAD_WIDTH_M[leg.class]) / 2
  const keep = !isCity
    ? KEEP_RIGHT_M[traveller][leg.class]
    : traveller === 'citizen'
      ? halfWidth - SIDEWALK_M[leg.class] / 2
      : (halfWidth - SIDEWALK_M[leg.class]) / 2
  const direction = isCity ? -1 : 1
  const beside = { x: -ahead.z * keep * direction, z: ahead.x * keep * direction }
  if (traveller !== 'citizen' || leg.class !== 'boulevard') return beside
  return ahead.x !== 0
    ? { x: beside.x, z: beside.z + Math.sign(claim.z - leg.from.z) * INNER_SIDEWALK_M }
    : { x: beside.x + Math.sign(claim.x - leg.from.x) * INNER_SIDEWALK_M, z: beside.z }
}

// The line a traveller really takes along the legs: each one moved to its side of the road, the
// corners joined where the two lines cross.
export function sidePath(
  legs: readonly Leg[],
  context: Rect | Pick<TownPlan, 'claim' | 'officeSites'>,
  traveller: Traveller
): RoutePoint[] {
  const moved = legs.map((leg) => {
    const beside = besideOf(leg, context, traveller)
    return {
      from: { x: leg.from.x + beside.x, z: leg.from.z + beside.z },
      to: { x: leg.to.x + beside.x, z: leg.to.z + beside.z },
      isAlongX: leg.from.z === leg.to.z
    }
  })
  const points: RoutePoint[] = []
  const add = (point: RoutePoint): void => {
    const last = points.at(-1)
    if (!last || last.x !== point.x || last.z !== point.z) points.push(point)
  }
  moved.forEach((leg, index) => {
    const next = moved.at(index + 1)
    if (index === 0) add(leg.from)
    if (!next) add(leg.to)
    else if (next.isAlongX === leg.isAlongX) {
      // Straight on into a road of another width, or a turn back: step across at the join.
      const isSameLine = leg.isAlongX ? leg.to.z === next.from.z : leg.to.x === next.from.x
      if (isSameLine) return
      add(leg.to)
      add(next.from)
    } else add(leg.isAlongX ? { x: next.from.x, z: leg.from.z } : { x: leg.from.x, z: next.from.z })
  })
  return points
}

export function lengthOf(points: readonly RoutePoint[]): number {
  let length = 0
  for (let index = 1; index < points.length; index++)
    length += Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].z - points[index - 1].z
    )
  return length
}

interface Wait {
  sec: number
  isIndoors: boolean
}

// Out along one side of the roads and back along the other, with a wait at each end.
export function closedLoop(
  out: readonly RoutePoint[],
  back: readonly RoutePoint[],
  away: Wait,
  home: Wait
): CitizenRoute {
  const points = [...out, ...back, out[0]]
  const length = lengthOf(points)
  return {
    points,
    length,
    isLoop: true,
    stops: [
      { at: lengthOf(out), ...away },
      { at: length, ...home }
    ]
  }
}

// The seconds on the clock when a mover is `share` of the way round its loop, on the move.
export function secondsAt(route: CitizenRoute, speed: number, share: number): number {
  const metres = share * route.length
  const waited = (route.stops ?? [])
    .filter((stop) => stop.at < metres)
    .reduce((sum, stop) => sum + stop.sec, 0)
  return metres / speed + waited
}
