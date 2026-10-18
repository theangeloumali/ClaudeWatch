import { describe, expect, it, vi } from 'vitest'
import { makeFloor } from '../../__tests__/fixtures'
import { citySidewalks } from '../../citizens/city-sidewalks'
import { routePose, type RoutePoint } from '../../citizens/route-pose'
import type { Rect } from '../../themes/lot-math'
import { distributedTown, streetFootprint } from '../distributed-town'
import { RAILWAY, railwayPlan, railwayReach } from '../railway-plan'
import { railwayStations, stationBoxes } from '../railway-stations'
import { timetable, trainAt } from '../railway-timetable'
import { townOf } from '../use-town-plan'
import type { TownPlan } from '../town-plan'

// Whole-city builds take ~1.7 s alone; a loaded suite runs past the 5 s default.
vi.setConfig({ testTimeout: 60_000 })

const EPSILON_M = 1e-6

function cityOf(columns: number, rows: number): TownPlan {
  const floors = Array.from({ length: columns * rows }, (_unused, index) =>
    makeFloor({
      floorId: `f${index}`,
      buildingId: `building:c:${index}`,
      x: (index % columns) * 64 + 32,
      z: Math.floor(index / columns) * 56 + 28,
      entrance: { x: (index % columns) * 64 + 32, z: Math.floor(index / columns) * 56 + 36 }
    })
  )
  return distributedTown(townOf(floors[0], null), floors).plan
}

function gapToRect(point: RoutePoint, rect: Rect): number {
  const dx = Math.max(0, Math.abs(point.x - rect.x) - rect.width / 2)
  const dz = Math.max(0, Math.abs(point.z - rect.z) - rect.depth / 2)
  return Math.hypot(dx, dz)
}

const contains = (outer: Rect, point: RoutePoint): boolean =>
  Math.abs(point.x - outer.x) <= outer.width / 2 + EPSILON_M &&
  Math.abs(point.z - outer.z) <= outer.depth / 2 + EPSILON_M

// Every half metre of a loop's centre line.
function samples(points: readonly RoutePoint[], length: number): RoutePoint[] {
  const route = { points: [...points], length, isLoop: true as const }
  return Array.from({ length: Math.ceil(length * 2) }, (_unused, step) =>
    routePose(route, step / 2)
  )
}

const plan = cityOf(4, 3)

describe('railwayPlan', () => {
  it('the ring sits 7 m outside the plan extent and crosses no sidewalk, zebra or lot', () => {
    const railway = railwayPlan(plan)
    expect(railway).not.toBeNull()
    if (!railway) return
    const centre = samples(railway.centre.points, railway.centre.length)
    const gaps = centre.map((point) => gapToRect(point, plan.extent))
    // A bend is drawn as chords, a centimetre or two inside its arc.
    expect(Math.min(...gaps)).toBeCloseTo(RAILWAY.offset, 1)
    const { network } = citySidewalks(plan)
    const ground = [
      ...plan.roads.map(streetFootprint),
      ...network.zebras,
      ...plan.lots,
      ...plan.officeSites
    ]
    for (const rect of ground)
      for (const point of centre)
        expect(gapToRect(point, rect)).toBeGreaterThan(RAILWAY.deckHalfWidth)
  })

  it('stations stand off the edge sidewalk', () => {
    const railway = railwayPlan(plan)
    if (!railway) throw new Error('no railway')
    const stations = railwayStations(railway)
    expect(stations.map((station) => station.id).sort()).toEqual(['east', 'north', 'south', 'west'])
    for (const station of stations) {
      expect(gapToRect(station.entrance, plan.extent)).toBeGreaterThanOrEqual(1.5)
      // Ground-standing parts: their cityward corners keep 1.5 m off the extent.
      for (const part of stationBoxes(station).filter((box) => box.y - box.height / 2 < 0.5)) {
        const across = { x: Math.cos(part.heading), z: -Math.sin(part.heading) }
        const along = { x: Math.sin(part.heading), z: Math.cos(part.heading) }
        for (const [u, v] of [
          [-1, -1],
          [-1, 1],
          [1, -1],
          [1, 1]
        ]) {
          const corner = {
            x: part.x + (across.x * u * part.width) / 2 + (along.x * v * part.length) / 2,
            z: part.z + (across.z * u * part.width) / 2 + (along.z * v * part.length) / 2
          }
          expect(gapToRect(corner, plan.extent)).toBeGreaterThanOrEqual(1.5)
        }
      }
    }
  })

  it('railwayPlan for 40 buildings takes under 10 ms', () => {
    const big = cityOf(8, 5)
    const started = performance.now()
    const railway = railwayPlan(big)
    expect(performance.now() - started).toBeLessThan(10)
    expect(railway).not.toBeNull()
    // Memoised per plan: the second ask is the same object.
    expect(railwayPlan(big)).toBe(railway)
  })

  it('gives a city with no streets no ring', () => {
    const empty = distributedTown(townOf(makeFloor({ floorId: 'f' }), null), []).plan
    expect(railwayPlan(empty)).toBeNull()
  })

  it('sceneBox contains the ring, so Horizon does not clip it', () => {
    const railway = railwayPlan(plan)
    if (!railway) throw new Error('no railway')
    const box = railwayReach(plan.extent, plan)
    for (const lane of [railway.centre, railway.lanes.inner, railway.lanes.outer])
      for (const point of lane.points) expect(contains(box, point)).toBe(true)
    // The deck's outer edge too, and every station part.
    const edge = samples(railway.centre.points, railway.centre.length).map((point) => ({
      x: point.x + Math.sign(point.x - plan.extent.x) * RAILWAY.deckHalfWidth,
      z: point.z + Math.sign(point.z - plan.extent.z) * RAILWAY.deckHalfWidth
    }))
    for (const point of edge) expect(contains(box, point)).toBe(true)
    for (const station of railwayStations(railway))
      for (const part of stationBoxes(station)) expect(contains(box, part)).toBe(true)
    // Without a town, the reach is left as it was.
    const empty = distributedTown(townOf(makeFloor({ floorId: 'f' }), null), []).plan
    expect(railwayReach(empty.extent, empty)).toEqual(empty.extent)
  })
})

describe('railway timetable', () => {
  const stops = [
    { at: 0, dwell: 4 },
    { at: 120, dwell: 4 },
    { at: 300, dwell: 4 }
  ]
  const table = timetable(stops, 14, 2.5, 400)

  it('the timetable is a pure function of time', () => {
    for (const seconds of [0, 3.9, 12.5, 47, 99.9, 1_700_000_000.25]) {
      expect(trainAt(table, seconds)).toEqual(trainAt(table, seconds))
      const lap = trainAt(table, seconds + table.period)
      expect(lap.at).toBeCloseTo(trainAt(table, seconds).at, 3)
    }
    // Second 0 finds the train dwelling at its first stop.
    expect(trainAt(table, 0)).toMatchObject({ at: 0, speed: 0 })
  })

  it('a short run never exceeds sqrt(distance × accel), and speed is continuous', () => {
    const short = timetable(
      [
        { at: 0, dwell: 1 },
        { at: 10, dwell: 1 }
      ],
      14,
      2.5,
      40
    )
    let previous = trainAt(short, 0).speed
    for (let seconds = 0; seconds < short.period; seconds += 0.01) {
      const { speed } = trainAt(short, seconds)
      expect(speed).toBeLessThanOrEqual(Math.sqrt(30 * 2.5) + EPSILON_M)
      expect(Math.abs(speed - previous)).toBeLessThan(0.05)
      previous = speed
    }
  })
})
