import type { Point } from '../../../office/sim/path'
import type { CitizenRoute, RoutePoint } from '../citizens/route-pose'
import type { Leg } from './road-net'
import { ROAD_WIDTH_M, SIDEWALK_M } from './town-grid'
import type { RoadClass } from './town-roads'

// A city lane's centre as a share of the half-carriageway. An avenue runs two lanes each way,
// split by the dashes at half, and traffic keeps to the outer one (clearspent-4).
const cityLaneShare = (road: RoadClass): number => (road === 'avenue' ? 0.75 : 0.5)

// Where a vehicle drives beside a leg's centre line: in its lane, on the city's keep-left side.
function besideOf(leg: Leg): Point {
  const ahead = { x: Math.sign(leg.to.x - leg.from.x), z: Math.sign(leg.to.z - leg.from.z) }
  const halfWidth = (leg.width ?? ROAD_WIDTH_M[leg.class]) / 2
  const keep = (halfWidth - SIDEWALK_M[leg.class]) * cityLaneShare(leg.class)
  return { x: ahead.z * keep, z: -ahead.x * keep }
}

// The line a vehicle really takes along the legs: each one moved to its lane, the corners joined
// where the two lines cross.
export function sidePath(legs: readonly Leg[]): RoutePoint[] {
  const moved = legs.map((leg) => {
    const beside = besideOf(leg)
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
