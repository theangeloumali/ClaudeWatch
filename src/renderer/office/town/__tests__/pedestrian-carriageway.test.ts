import { describe, expect, it } from 'vitest'
import { CITIZEN_BODY_RADIUS } from '../../../../shared/office/body-footprints'
import { SIDEWALK_M } from '../../../../shared/office/town-roads'
import { citizenGround, citySidewalks } from '../../citizens/city-sidewalks'
import { citizenBodyId } from '../../citizens/crowd-movement'
import { moverClock } from '../../citizens/mover-clock'
import { stepMovers } from '../../citizens/mover-step'
import { routePhase, routePose, type RoutePoint } from '../../citizens/route-pose'
import { NOSE_M, zebraTraffic } from '../../citizens/zebra-traffic'
import { SceneBodies } from '../../scene/BodySpace'
import { EDO } from '../../themes/palettes'
import { fallbackDress } from '../fallback-dress'
import { reversed } from '../road-net'
import { groundQuads } from '../town-ground'
import {
  isAsphalt,
  liveCity,
  partsOf,
  roadSurface,
  samplesOf,
  streetOffset,
  twoOfficeCity,
  within,
  type Scenario
} from './pedestrian.test-utils'

// Promoted from the CW-WALK audit probe, city rows only: the legacy campus paints no zebras, so
// its rows could never pass (citizens-7).

const STILL_M = 1e-3
const DWELL_SEC = 1
// Longer than a walker waits for a crossing to clear: standing still this long is a jam.
const JAM_LIMIT_SEC = 10
// How near a vehicle's front a walker holds it up.
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

// Mid-block vehicle samples, against each street's lane centres and the lines that divide them:
// an avenue runs two lanes each way, a collector one. Junction boxes and street ends, where
// vehicles turn, are left out.
function vehicleLanes(scenario: Scenario) {
  const strips = scenario.plan.roads.map((road) => {
    const isAlongX = road.from.z === road.to.z
    const length = Math.abs(road.to.x - road.from.x) + Math.abs(road.to.z - road.from.z)
    const centre = { x: (road.from.x + road.to.x) / 2, z: (road.from.z + road.to.z) / 2 }
    const box = (reach: number) => ({
      ...centre,
      width: isAlongX ? reach : road.width,
      depth: isAlongX ? road.width : reach
    })
    return { road, isAlongX, inner: box(length - road.width), grown: box(length + road.width) }
  })
  let samples = 0
  const offLane: string[] = []
  const onDivider: string[] = []
  for (const trip of scenario.trips.filter((each) => each.kind !== 'citizen'))
    trip.route.points.slice(1).forEach((to, index) => {
      const from = trip.route.points[index]
      const isAlongX = Math.abs(from.z - to.z) < 1e-6
      // A loop's closing step cuts its corner inside the junction box: not mid-block.
      if (!isAlongX && Math.abs(from.x - to.x) > 1e-6) return
      for (const point of samplesOf(from, to)) {
        const under = strips.filter((strip) => within(strip.grown, point))
        if (under.length !== 1 || !within(under[0].inner, point)) continue
        if (under[0].isAlongX !== isAlongX) continue
        const { road } = under[0]
        const half = road.width / 2 - SIDEWALK_M[road.class]
        const offset = Math.abs(isAlongX ? point.z - road.from.z : point.x - road.from.x)
        const [lanes, dividers] =
          road.class === 'avenue'
            ? [
                [0.25, 0.75],
                [0, 0.5]
              ]
            : [[0.5], [0]]
        samples++
        const where = `${road.id}@${offset.toFixed(2)}`
        if (!lanes.some((share) => Math.abs(offset - share * half) <= 0.3)) offLane.push(where)
        if (dividers.some((share) => Math.abs(offset - share * half) < 0.3)) onDivider.push(where)
      }
    })
  return { samples, offLane, onDivider }
}

// Every vehicle route sample outside the painted carriageway, keyed by kind and spot.
function vehiclesOffPaving(scenario: Scenario): string[] {
  const paved = groundQuads(scenario.plan, fallbackDress(EDO)).filter(
    (quad) => quad.layer === 'carriageway'
  )
  return scenario.trips
    .filter((trip) => trip.kind !== 'citizen')
    .flatMap((trip) =>
      trip.route.points
        .slice(1)
        .flatMap((to, index) =>
          [...samplesOf(trip.route.points[index], to), to]
            .filter((point) => !paved.some((rect) => within(rect, point)))
            .map((point) => `${trip.kind}@${point.x.toFixed(2)}:${point.z.toFixed(2)}`)
        )
    )
}

// MoverLayer's motion, replayed headless through the same step.
function replay(scenario: Scenario, seconds: number, deltaSec: number) {
  const { plan, trips } = scenario
  const spotOf = roadSurface(plan)
  const onAsphalt = (point: RoutePoint): boolean => isAsphalt(spotOf(point))
  const space = new SceneBodies()
  const ground = citizenGround(plan)
  const clock = moverClock({ trips, space, isOpen: ground.isOpen })
  const { waitsFor } = clock
  const traffic = zebraTraffic(trips, citySidewalks(plan))
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
  // Seconds each citizen has stood still anywhere, outside a wait on its route.
  const stuckSec = new Map<number, number>()
  let longestStuckSec = 0
  let stillOnRoadEvents = 0
  let heldByRoadWalkerSec = 0
  let overlaps = 0
  const close = (index: number): void => {
    if ((stillSec.get(index) ?? 0) >= DWELL_SEC) stillOnRoadEvents++
    stillSec.delete(index)
  }
  for (let frame = 0; frame < Math.round(seconds / deltaSec); frame++) {
    const before = [...clock.positions]
    const walked = Float64Array.from(clock.moved)
    stepMovers({ trips, clock, space, ground, player: null, waitsFor, traffic, deltaSec })
    const onFoot = clock.onFoot
    for (const index of citizens) {
      const pose = clock.positions[index]
      if (pose.isIndoors) {
        close(index)
        stuckSec.delete(index)
        continue
      }
      const trip = trips[index]
      const isStill = Math.hypot(pose.x - before[index].x, pose.z - before[index].z) < STILL_M
      if (!onAsphalt(pose) || !isStill) close(index)
      else stillSec.set(index, (stillSec.get(index) ?? 0) + deltaSec)
      if (!isStill || routePhase(trip.route, clock.moved[index], trip.speed).isWaiting)
        stuckSec.delete(index)
      else {
        const stuck = (stuckSec.get(index) ?? 0) + deltaSec
        stuckSec.set(index, stuck)
        longestStuckSec = Math.max(longestStuckSec, stuck)
      }
    }
    for (const index of vehicles) {
      const trip = trips[index]
      const nose = trip.kind === 'citizen' ? 0 : NOSE_M[trip.kind]
      if (clock.moved[index] === walked[index]) {
        const front = routePose(trip.route, walked[index] * trip.speed + nose, trip.speed)
        const blocker = onFoot.find(
          (walker) => Math.hypot(front.x - walker.x, front.z - walker.z) < VEHICLE_HOLD_M
        )
        if (blocker && onAsphalt(blocker)) heldByRoadWalkerSec += deltaSec
      }
      const body = routePose(trip.route, clock.moved[index] * trip.speed, trip.speed)
      overlaps += onFoot.filter(
        (walker) => Math.hypot(walker.x - body.x, walker.z - body.z) < VEHICLE_BODY_M
      ).length
    }
  }
  citizens.forEach(close)
  return {
    spawnedOnRoad,
    stillOnRoadEvents,
    longestStuckSec: Math.round(longestStuckSec * 10) / 10,
    heldByRoadWalkerSec: Math.round(heldByRoadWalkerSec * 10) / 10,
    overlapFrames: overlaps
  }
}

// The 15-minute live-city replay, run once for the rows that read it.
let cityReplayResult: ReturnType<typeof replay> | undefined
const cityReplay = (): ReturnType<typeof replay> =>
  (cityReplayResult ??= replay(liveCity(), 900, 1 / 20))

// The same city with every mover that much further round its loop: other meetings.
function laterCity(offsetSec: number): Scenario {
  const city = liveCity()
  return {
    ...city,
    trips: city.trips.map((trip) => ({ ...trip, startSec: trip.startSec + offsetSec }))
  }
}

describe('pedestrian carriageway: road geometry', () => {
  it('keeps a road width when a walk is reversed', () => {
    const [leg] = reversed([
      { from: { x: 0, z: 0 }, to: { x: 12, z: 0 }, class: 'collector', width: 8 }
    ])
    expect(leg.width).toBe(8)
  })

  it('sits a freight return leg on its own lane offset', () => {
    const result = freightLaneOffsets(liveCity())
    expect(result.compared).toBeGreaterThan(0)
    expect(result.mismatches).toEqual([])
  })
})

describe.each([
  ['the live city', liveCity],
  ['the two-office district', twoOfficeCity]
])('vehicles on %s', (_name, build) => {
  it('drives mid-block on a lane centre, never on a lane divider', () => {
    const result = vehicleLanes(build())
    expect(result.samples).toBeGreaterThan(0)
    expect(
      { offLane: result.offLane.length, onDivider: result.onDivider.length },
      [...new Set(result.offLane)].slice(0, 12).join(' ')
    ).toEqual({
      offLane: 0,
      onDivider: 0
    })
  })

  it('keeps every vehicle on the painted carriageway, through corners and dead ends', () => {
    const off = vehiclesOffPaving(build())
    expect(off.length, [...new Set(off)].slice(0, 12).join(' ')).toBe(0)
  })

  it('closes each transit and runabout loop on its lanes, never cutting a corner', () => {
    const diagonals = build()
      .trips.filter((trip) => trip.kind === 'transit' || trip.kind === 'runabout')
      .flatMap((trip) =>
        trip.route.points.slice(1).flatMap((to, index) => {
          const from = trip.route.points[index]
          const isDiagonal = Math.abs(to.x - from.x) > 1e-6 && Math.abs(to.z - from.z) > 1e-6
          return isDiagonal ? [`${trip.kind} ${from.x.toFixed(2)}:${from.z.toFixed(2)}`] : []
        })
      )
    expect(diagonals).toEqual([])
  })
})

// Citizen rows: RED until Phase 4 moves citizens onto the sidewalk network.
describe('pedestrian carriageway on the live city', () => {
  it('shuts the citizens’ ground on unmarked asphalt and opens it on a zebra', () => {
    const { plan } = liveCity()
    const ground = citizenGround(plan)
    const spotOf = roadSurface(plan)
    const centreLines = plan.roads
      .filter((road) => road.class !== 'lane')
      .flatMap((road) => samplesOf(road.from, road.to))
    const zebras = centreLines.filter((point) => spotOf(point) === 'zebra')
    const wrong = centreLines.filter((point) => ground.isOpen(point) === isAsphalt(spotOf(point)))
    expect(zebras.length).toBeGreaterThan(0)
    expect(wrong.length, JSON.stringify(wrong.slice(0, 6))).toBe(0)
  })

  it('keeps every citizen route off unmarked asphalt', () => {
    const result = routeIntrusions(liveCity())
    expect(result.onRoad, JSON.stringify(result.byPart)).toBe(0)
  })

  it('never leaves a citizen standing on asphalt, or holding up traffic', () => {
    const result = cityReplay()
    expect(
      {
        spawnedOnRoad: result.spawnedOnRoad,
        stillOnRoadEvents: result.stillOnRoadEvents,
        heldByRoadWalkerSec: result.heldByRoadWalkerSec
      },
      JSON.stringify(result)
    ).toEqual({ spawnedOnRoad: 0, stillOnRoadEvents: 0, heldByRoadWalkerSec: 0 })
  }, 300_000)

  it('keeps every vehicle 1.2 m clear of every walker', () => {
    const overlaps = [cityReplay(), replay(laterCity(251), 900, 1 / 20)].map(
      (result) => result.overlapFrames
    )
    expect(overlaps).toEqual([0, 0])
  }, 300_000)

  it('never leaves a citizen jammed', () => {
    const result = cityReplay()
    expect(result.longestStuckSec, JSON.stringify(result)).toBeLessThan(JAM_LIMIT_SEC)
  }, 300_000)
})
