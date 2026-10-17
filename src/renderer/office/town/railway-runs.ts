import { routePose, type CitizenRoute, type RoutePoint } from '../citizens/route-pose'
import type { QualityLevel } from '../logic/quality'
import { clamp } from '../../../shared/range'
import type { RailwayPlan } from './railway-plan'
import { railwayStations } from './railway-stations'
import { timetable, trainAt, type TrainState } from './railway-timetable'

export type CarKind = 'commuter' | 'locomotive' | 'wagon'

// Real scale: a car narrower than about 6 px at the city band reads as noise (ClearSpent trap 29).
export const CAR_LENGTH: Record<CarKind, number> = { commuter: 9, locomotive: 10, wagon: 9 }
const CAR_GAP_M = 1
// Fast enough to read at the governor's 5–20 fps idle pace (N6).
export const TRAIN_SPEEDS = { commuter: 14, freight: 12 } as const
const COMMUTER = { accel: 2.5, dwell: 4 }
const COMMUTER_CARS: Record<QualityLevel, number> = { full: 4, balanced: 2, light: 0 }
const FREIGHT_WAGONS = 6

interface TrainCar {
  kind: CarKind
  // The car's slot in its kind's mesh, and its middle's distance from the train's head.
  slot: number
  offset: number
  isReversed: boolean
}

export interface TrainRun {
  lane: CitizenRoute
  cars: TrainCar[]
  at(seconds: number): TrainState
}

// Cars laid end to end behind the head, one slot each in their kind's mesh. A kind runs in one
// train only, so its slots count from 0 here.
function coupled(kinds: readonly CarKind[], step: 1 | -1): TrainCar[] {
  const slots = new Map<CarKind, number>()
  let cursor = 0
  return kinds.map((kind) => {
    const length = CAR_LENGTH[kind]
    const slot = slots.get(kind) ?? 0
    slots.set(kind, slot + 1)
    const car = { kind, slot, offset: cursor + (step * length) / 2, isReversed: step > 0 }
    cursor += step * (length + CAR_GAP_M)
    return car
  })
}

const trainLength = (kinds: readonly CarKind[]): number =>
  kinds.reduce((sum, kind) => sum + CAR_LENGTH[kind], 0) + CAR_GAP_M * (kinds.length - 1)

// The metres round a loop of the point on it nearest `point`.
function metresAlong(route: CitizenRoute, point: RoutePoint): number {
  let best = { gap: Infinity, at: 0 }
  let start = 0
  for (let index = 1; index < route.points.length; index++) {
    const [from, to] = [route.points[index - 1], route.points[index]]
    const span = Math.hypot(to.x - from.x, to.z - from.z)
    const toward = (point.x - from.x) * (to.x - from.x) + (point.z - from.z) * (to.z - from.z)
    const share = span > 0 ? clamp(toward / (span * span), [0, 1]) : 0
    const gap = Math.hypot(
      from.x + (to.x - from.x) * share - point.x,
      from.z + (to.z - from.z) * share - point.z
    )
    if (gap < best.gap) best = { gap, at: start + share * span }
    start += span
  }
  return best.at
}

// A commuter calling at every station clockwise, its head past mid-platform, and at full a
// freight running the other way round the outer track without stopping. Pure.
export function trainRuns(railway: RailwayPlan, level: QualityLevel): TrainRun[] {
  const commuterCars = Array.from({ length: COMMUTER_CARS[level] }, (): CarKind => 'commuter')
  if (commuterCars.length === 0) return []
  const { inner, outer } = railway.lanes
  const stations = railwayStations(railway)
  const stops = stations
    .map((station) => ({
      at: (metresAlong(inner, station.centre) + trainLength(commuterCars) / 2) % inner.length,
      dwell: COMMUTER.dwell
    }))
    .sort((first, second) => first.at - second.at)
  const table = timetable(stops, TRAIN_SPEEDS.commuter, COMMUTER.accel, inner.length)
  const runs: TrainRun[] = [
    {
      lane: inner,
      cars: coupled(commuterCars, -1),
      at: (seconds) => trainAt(table, seconds)
    }
  ]
  if (level !== 'full') return runs
  const freightCars: CarKind[] = ['locomotive', ...Array<CarKind>(FREIGHT_WAGONS).fill('wagon')]
  const south = stations.find((station) => station.id === 'south') ?? stations[0]
  const start = metresAlong(outer, south.centre) - trainLength(freightCars) / 2
  runs.push({
    lane: outer,
    cars: coupled(freightCars, 1),
    at: (seconds) => ({
      at: start - TRAIN_SPEEDS.freight * seconds,
      speed: TRAIN_SPEEDS.freight,
      direction: -1
    })
  })
  return runs
}

// A point `metres` round a loop, either way past its start.
export function laneAt(lane: CitizenRoute, metres: number): RoutePoint {
  return routePose(lane, ((metres % lane.length) + lane.length) % lane.length)
}
