import type { SceneBodies } from '../scene/BodySpace'
import type { Trip } from '../town/town-trips'
import { seedCrowd, type CitizenMotionPose } from './crowd-movement'
import type { RoutePoint } from './route-pose'

// dry-new: the layer's all-trip memo resets unchanged citizens when only their dress/count changes.
export interface MoverClock {
  keys: string[]
  moved: Float64Array
  headings: Float64Array
  strides: Float64Array
  isWalking: boolean[]
  positions: CitizenMotionPose[]
  onFoot: RoutePoint[]
  // Who is stuck behind whom, so the crowd can break its own jams.
  waitsFor: Map<string, string>
}

export function moverRouteKey(trip: Trip): string {
  return JSON.stringify([
    trip.kind,
    trip.speed,
    trip.startSec,
    trip.route.points.map((point) => [point.x, point.z]),
    trip.route.length,
    !!trip.route.isLoop,
    trip.route.stops?.map((stop) => [stop.at, stop.sec, stop.isIndoors]) ?? []
  ])
}

interface MoverClockOptions {
  trips: readonly Trip[]
  space: SceneBodies
  isOpen: (point: RoutePoint) => boolean
  previous?: MoverClock
}

export function moverClock({ trips, space, isOpen, previous }: MoverClockOptions): MoverClock {
  const keys = trips.map(moverRouteKey)
  const remaining = new Set(previous?.keys.map((_key, index) => index))
  const retained = keys.map((key) => {
    const index = previous?.keys.findIndex(
      (before, index) => before === key && remaining.has(index)
    )
    if (index === undefined || index < 0) return undefined
    remaining.delete(index)
    return index
  })
  const positions = seedCrowd(
    trips,
    space,
    isOpen,
    retained.map((index) => (index === undefined ? undefined : previous?.positions[index]))
  )
  return {
    keys,
    positions,
    moved: Float64Array.from(trips, (trip, index) => {
      const before = retained[index]
      return before === undefined ? trip.startSec : (previous?.moved[before] ?? trip.startSec)
    }),
    headings: Float64Array.from(positions, (pose, index) => {
      const before = retained[index]
      return before === undefined ? pose.heading : (previous?.headings[before] ?? pose.heading)
    }),
    strides: Float64Array.from(trips, (_trip, index) => {
      const before = retained[index]
      return before === undefined ? 0 : (previous?.strides[before] ?? 0)
    }),
    isWalking: trips.map((_trip, index) => {
      const before = retained[index]
      return before === undefined ? false : (previous?.isWalking[before] ?? false)
    }),
    onFoot: [],
    waitsFor: new Map()
  }
}
