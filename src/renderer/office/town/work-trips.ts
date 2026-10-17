import type { ToolCategory } from '../../../shared/office/types'
import type { CitizenRoute, RoutePoint } from '../citizens/route-pose'
import { railwayPlan } from './railway-plan'
import { railwayStations } from './railway-stations'
import { roadPath, type RoadNet } from './road-net'
import type { TownPlan } from './town-plan'
import type { VehicleRole } from './town-dress'
import { lengthOf, sidePath } from './trip-paths'

// What a real tool call sends out: work shipped, fetched from outside, or help arriving.
// Reads and other desk work send nothing; the robot already shows them.
const ROLE_OF: Record<ToolCategory, VehicleRole | null> = {
  edit: 'freight',
  run: 'freight',
  web: 'runabout',
  agent: 'transit',
  read: null,
  other: null
}

export const workRole = (category: ToolCategory): VehicleRole | null => ROLE_OF[category]

// A place the trip waits at, kerbside: the office, a workshop or a station.
export interface WorkStop {
  point: RoutePoint
  sec: number
}

const KERB_SEC = 2
const LOADING_SEC = 5
const STATION_SEC = 4
const BUS_STOP_SEC = 4

const isPoint = (value: unknown): value is RoutePoint =>
  typeof value === 'object' &&
  value !== null &&
  'x' in value &&
  'z' in value &&
  typeof value.x === 'number' &&
  typeof value.z === 'number'

// The office's door, or its middle where the floor names no entrance; the road net finds its kerb.
export function officeDoor(plan: TownPlan, buildingId: string): RoutePoint | null {
  const site = plan.officeSites.find(
    (candidate) => 'buildingId' in candidate && candidate.buildingId === buildingId
  )
  if (!site) return null
  const entrance = 'entrance' in site ? site.entrance : undefined
  return isPoint(entrance) ? entrance : { x: site.x, z: site.z }
}

const gap = (a: RoutePoint, b: RoutePoint): number => Math.hypot(a.x - b.x, a.z - b.z)

function nearest(points: readonly RoutePoint[], to: RoutePoint): RoutePoint | null {
  return points.reduce<RoutePoint | null>(
    (best, point) => (!best || gap(point, to) < gap(best, to) ? point : best),
    null
  )
}

// Where a role's trip waits, in order, from an office door; null when the city has nowhere to go.
export function workStops(plan: TownPlan, role: VehicleRole, door: RoutePoint): WorkStop[] | null {
  if (role === 'transit') return [{ point: door, sec: BUS_STOP_SEC }]
  const railway = role === 'runabout' ? railwayPlan(plan) : null
  const away =
    role === 'freight'
      ? nearest(
          plan.lots.filter((lot) => lot.zone === 'workshop').map((lot) => lot.door),
          door
        )
      : railway &&
        nearest(
          railwayStations(railway).map((station) => station.entrance),
          door
        )
  if (!away) return null
  const wait = role === 'freight' ? LOADING_SEC : STATION_SEC
  return [
    { point: door, sec: KERB_SEC },
    { point: away, sec: wait },
    { point: door, sec: KERB_SEC }
  ]
}

// From where the vehicle is, along the lanes the paint shows, waiting at each stop, then on to
// `home`: the point it rejoins its ambient loop at.
export function workRoute(
  net: RoadNet,
  from: RoutePoint,
  stops: readonly WorkStop[],
  home: RoutePoint
): CitizenRoute | null {
  const points: RoutePoint[] = [from]
  const waits: number[] = []
  let here = from
  for (const target of [...stops.map((stop) => stop.point), home]) {
    const legs = roadPath(net, here, target)
    if (!legs) return null
    points.push(...sidePath(legs))
    waits.push(lengthOf(points))
    here = target
  }
  points.push(home)
  return {
    points,
    length: lengthOf(points),
    isLoop: true,
    stops: stops.map((stop, index) => ({ at: waits[index], sec: stop.sec, isIndoors: false }))
  }
}
