import type { BodyFootprint } from '../../../shared/office/body-footprints'
import type { WalkGround } from '../player/walk-ground'
import type { SceneBodies } from '../scene/BodySpace'
import type { Trip } from '../town/town-trips'
import { CITIZEN_POSITION_EPSILON } from './citizen-navigation'
import { advanceCitizen } from './crowd-movement'
import type { MoverClock } from './mover-clock'
import type { RoutePoint } from './route-pose'
import {
  entersCrossedZebra,
  isHeldAtZebra,
  zebrasCrossed,
  zebrasInUse,
  type ZebraTraffic
} from './zebra-traffic'

// Workers above this are on a floor, not in the street.
const STREET_LEVEL_M = 1

interface MoverStep {
  trips: readonly Trip[]
  clock: MoverClock
  space: SceneBodies
  ground: WalkGround
  player: RoutePoint | null
  waitsFor?: Map<string, string>
  traffic?: ZebraTraffic | null
  deltaSec: number
}

const isInTheStreet = (body: BodyFootprint): boolean =>
  Math.abs(body.elevation ?? 0) < STREET_LEVEL_M

// One frame of the town's movers, headless: citizens first, waiting at the kerb for a vehicle
// on their zebra; then vehicles, holding at the stop line of a zebra in use (citizens-6, P6b).
export function stepMovers(step: MoverStep): void {
  const { trips, clock, space, ground, player, waitsFor, traffic, deltaSec } = step
  const { moved, onFoot } = clock
  const crossed = traffic ? zebrasCrossed(traffic, trips, moved) : null
  onFoot.length = 0
  trips.forEach((trip, index) => {
    if (trip.kind !== 'citizen') return
    const next = advanceCitizen({
      trip,
      index,
      pose: clock.positions[index],
      walked: moved[index],
      deltaSec,
      space,
      isOpen: ground.isOpen,
      ground,
      waitsFor,
      canStepOnto:
        traffic && crossed?.size
          ? (from, to) => !entersCrossedZebra(traffic, crossed, from, to)
          : undefined
    })
    clock.positions[index] = next.pose
    moved[index] = next.walked
    clock.strides[index] += next.distance
    clock.isWalking[index] = next.distance > CITIZEN_POSITION_EPSILON
    if (!next.pose.isIndoors) onFoot.push(next.pose)
  })
  const inUse = traffic
    ? zebrasInUse(traffic, [
        ...onFoot,
        ...space.workers.filter(isInTheStreet),
        ...(player ? [player] : [])
      ])
    : null
  trips.forEach((trip, index) => {
    if (trip.kind === 'citizen') return
    const walked = moved[index]
    const isHeld =
      traffic && inUse?.size
        ? isHeldAtZebra({ traffic, trip, index, walked, deltaSec, inUse })
        : false
    if (!isHeld) moved[index] = walked + deltaSec
  })
}
