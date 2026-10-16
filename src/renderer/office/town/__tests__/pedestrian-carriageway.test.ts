import { describe, expect, it } from 'vitest'
import { CITIZEN_BODY_RADIUS } from '../../../../shared/office/body-footprints'
import { advanceCitizen, citizenBodyId } from '../../citizens/crowd-movement'
import { moverClock } from '../../citizens/mover-clock'
import { routePose, walkedSec, type RoutePoint } from '../../citizens/route-pose'
import { walkGround } from '../../player/walk-ground'
import { SceneBodies } from '../../scene/BodySpace'
import { reversed, roadNet, roadPath, type Leg } from '../road-net'
import type { MoverKind } from '../town-trips'
import { sidePath } from '../trip-paths'
import {
  isAsphalt,
  liveCity,
  partsOf,
  roadSurface,
  samplesOf,
  streetOffset,
  type Scenario
} from './pedestrian.test-utils'

// Promoted from the CW-WALK audit probe, city rows only: the legacy campus paints no zebras, so
// its rows could never pass (citizens-7).

const STILL_M = 1e-3
const DWELL_SEC = 1
// MoverLayer's NOSE_M and VEHICLE_HOLD_M.
const NOSE_M: Record<Exclude<MoverKind, 'citizen'>, number> = {
  transit: 3,
  freight: 2,
  runabout: 1.4
}
const VEHICLE_HOLD_M = 1.4
const VEHICLE_BODY_M = 1.2

// Every route sample of every citizen on unmarked asphalt, keyed `part/spot`.
function routeIntrusions(scenario: Scenario) {
  const spotOf = roadSurface(scenario.plan)
  const byPart: Record<string, number> = {}
  for (const trip of scenario.trips.filter((each) => each.kind === 'citizen'))
    for (const { from, to, part } of partsOf(trip))
      for (const point of samplesOf(from, to)) {
        const spot = spotOf(point)
        if (isAsphalt(spot)) byPart[`${part}/${spot}`] = (byPart[`${part}/${spot}`] ?? 0) + 1
      }
  const onRoad = Object.values(byPart).reduce((sum, count) => sum + count, 0)
  return { onRoad, byPart }
}

// What `reversed` should return: the same legs, the other way, each with its own width.
const reversedKeepingWidth = (legs: readonly Leg[]): Leg[] =>
  legs.map((leg) => ({ ...leg, from: leg.to, to: leg.from })).reverse()

function backPathCompare(scenario: Scenario) {
  const { plan, trips } = scenario
  const spotOf = roadSurface(plan)
  const net = roadNet(plan, 'citizen')
  const doorOf = new Map(plan.lots.map((lot) => [lot.id, lot.door]))
  const asphaltSamples = (points: readonly RoutePoint[]): number =>
    points
      .slice(1)
      .flatMap((to, index) => samplesOf(points[index], to))
      .filter((point) => isAsphalt(spotOf(point))).length
  let shipped = 0
  let widthKept = 0
  for (const trip of trips.filter((each) => each.kind === 'citizen')) {
    const door = trip.homeId ? doorOf.get(trip.homeId) : undefined
    const goal = partsOf(trip).find(({ part }) => part === 'leave-goal')?.from
    const legs = door && goal ? roadPath(net, door, goal) : null
    if (!legs) continue
    shipped += asphaltSamples(sidePath(reversed(legs), plan, 'citizen'))
    widthKept += asphaltSamples(sidePath(reversedKeepingWidth(legs), plan, 'citizen'))
  }
  return { shipped, widthKept }
}

// For every freight run, the lane offsets its outbound and return halves keep on each street.
function freightLaneOffsets(scenario: Scenario) {
  const mismatches: string[] = []
  let compared = 0
  for (const trip of scenario.trips.filter((each) => each.kind === 'freight')) {
    const out = new Map<string, number>()
    const back = new Map<string, number>()
    for (const { from, to, part } of partsOf(trip)) {
      const found = streetOffset(scenario.plan, from, to)
      if (!found) continue
      const side = part === 'back' || part === 'arrive-home' ? back : out
      side.set(found.roadId, Math.abs(found.offset))
    }
    for (const [roadId, offset] of back) {
      const outward = out.get(roadId)
      if (outward === undefined) continue
      compared++
      if (Math.abs(outward - offset) > 1e-6)
        mismatches.push(`${roadId}: out ${outward.toFixed(2)} back ${offset.toFixed(2)}`)
    }
  }
  return { compared, mismatches }
}

// MoverLayer.place, replayed headless: citizens step among bodies, vehicles hold for anyone on foot.
function replay(scenario: Scenario, seconds: number, deltaSec: number) {
  const { plan, trips, floor } = scenario
  const spotOf = roadSurface(plan)
  const onAsphalt = (point: RoutePoint): boolean => isAsphalt(spotOf(point))
  const space = new SceneBodies()
  const ground = walkGround(floor, plan.lots, plan.extent)
  const clock = moverClock({ trips, space, isOpen: ground.isOpen })
  clock.positions.forEach((pose, index) => {
    if (trips[index].kind === 'citizen' && !pose.isIndoors)
      space.set({ id: citizenBodyId(index), x: pose.x, z: pose.z, radius: CITIZEN_BODY_RADIUS })
  })
  const citizens = trips.flatMap((trip, index) => (trip.kind === 'citizen' ? [index] : []))
  const vehicles = trips.flatMap((trip, index) => (trip.kind === 'citizen' ? [] : [index]))
  const spawnedOnRoad = citizens.filter(
    (index) => !clock.positions[index].isIndoors && onAsphalt(clock.positions[index])
  ).length
  // Seconds each citizen has stood still on asphalt; a run of a second or more is one event.
  const stillSec = new Map<number, number>()
  let stillOnRoadEvents = 0
  let heldByRoadWalkerSec = 0
  let overlaps = 0
  const close = (index: number): void => {
    if ((stillSec.get(index) ?? 0) >= DWELL_SEC) stillOnRoadEvents++
    stillSec.delete(index)
  }
  for (let frame = 0; frame < Math.round(seconds / deltaSec); frame++) {
    const onFoot: RoutePoint[] = []
    for (const index of citizens) {
      const trip = trips[index]
      const before = clock.positions[index]
      const next = advanceCitizen({
        trip,
        index,
        pose: before,
        walked: clock.moved[index],
        deltaSec,
        space,
        isOpen: ground.isOpen,
        ground
      })
      clock.positions[index] = next.pose
      clock.moved[index] = next.walked
      const pose = next.pose
      if (pose.isIndoors) {
        close(index)
        continue
      }
      onFoot.push(pose)
      const isStill = Math.hypot(pose.x - before.x, pose.z - before.z) < STILL_M
      if (!onAsphalt(pose) || !isStill) close(index)
      else stillSec.set(index, (stillSec.get(index) ?? 0) + deltaSec)
    }
    for (const index of vehicles) {
      const trip = trips[index]
      const nose = trip.kind === 'citizen' ? 0 : NOSE_M[trip.kind]
      const walked = clock.moved[index]
      const next = walkedSec({
        route: trip.route,
        speed: trip.speed,
        walked,
        deltaSec,
        player: null,
        others: onFoot,
        reach: nose,
        radius: VEHICLE_HOLD_M
      })
      clock.moved[index] = next
      if (next === walked) {
        const front = routePose(trip.route, (walked + deltaSec) * trip.speed + nose, trip.speed)
        const blocker = onFoot.find(
          (walker) => Math.hypot(front.x - walker.x, front.z - walker.z) < VEHICLE_HOLD_M
        )
        if (blocker && onAsphalt(blocker)) heldByRoadWalkerSec += deltaSec
      }
      const body = routePose(trip.route, next * trip.speed, trip.speed)
      overlaps += onFoot.filter(
        (walker) => Math.hypot(walker.x - body.x, walker.z - body.z) < VEHICLE_BODY_M
      ).length
    }
  }
  citizens.forEach(close)
  return {
    spawnedOnRoad,
    stillOnRoadEvents,
    heldByRoadWalkerSec: Math.round(heldByRoadWalkerSec * 10) / 10,
    overlapFrames: overlaps
  }
}

describe('pedestrian carriageway: road geometry', () => {
  it('keeps a road width when a walk is reversed', () => {
    const [leg] = reversed([
      { from: { x: 0, z: 0 }, to: { x: 12, z: 0 }, class: 'collector', width: 8 }
    ])
    expect(leg.width).toBe(8)
  })

  it('walks the live city back on the sidewalk, as it walked out', () => {
    const compare = backPathCompare(liveCity())
    expect(compare.shipped).toBe(compare.widthKept)
  })

  it('sits a freight return leg on its own lane offset', () => {
    const result = freightLaneOffsets(liveCity())
    expect(result.compared).toBeGreaterThan(0)
    expect(result.mismatches).toEqual([])
  })
})

// Citizen rows: RED until Phase 4 moves citizens onto the sidewalk network.
describe('pedestrian carriageway on the live city', () => {
  it('keeps every citizen route off unmarked asphalt', () => {
    const result = routeIntrusions(liveCity())
    expect(result.onRoad, JSON.stringify(result.byPart)).toBe(0)
  })

  it('never leaves a citizen standing on asphalt, or holding up traffic', () => {
    const result = replay(liveCity(), 900, 1 / 20)
    expect(
      {
        spawnedOnRoad: result.spawnedOnRoad,
        stillOnRoadEvents: result.stillOnRoadEvents,
        heldByRoadWalkerSec: result.heldByRoadWalkerSec
      },
      JSON.stringify(result)
    ).toEqual({ spawnedOnRoad: 0, stillOnRoadEvents: 0, heldByRoadWalkerSec: 0 })
  }, 300_000)
})
