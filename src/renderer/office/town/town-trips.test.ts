import { describe, expect, it, vi } from 'vitest'
import { boundsOfZone } from '../logic/zone-framing'
import { QUALITY_LEVELS } from '../logic/quality'
import { grow, hashOf } from '../themes/lot-math'
import { MOVER_FLOORS, isOn, isWithin, lapOf, townOn } from './movers.test-utils'
import { campusClaim, neededClaim } from './town-claim'
import { ROAD_WIDTH_M } from './town-grid'
import { lotOwners, townBlocks } from './town-plan'
import { MOVER_COUNTS, destinationOf, townTrips, type Trip } from './town-trips'
import { roadStrip, widened } from './town.test-utils'

// Full sim or scene builds: the 5 s default times out under multi-agent load (health-9).
vi.setConfig({ testTimeout: 60_000 })

const citizensOf = (trips: readonly Trip[]): Trip[] =>
  trips.filter((trip) => trip.kind === 'citizen')
const vehiclesOf = (trips: readonly Trip[]): Trip[] =>
  trips.filter((trip) => trip.kind !== 'citizen')
const kindsOf = (trips: readonly Trip[]): Set<string> =>
  new Set(trips.map((trip) => `${trip.kind}:${trip.themeId}:${trip.figure}`))

describe('destinationOf', () => {
  it('sends citizens out in the shares the town was planned for', () => {
    const SAMPLE = 20000
    const counts: Record<string, number> = {}
    for (let index = 0; index < SAMPLE; index++) {
      const destination = destinationOf(hashOf(`citizen:${index}`))
      counts[destination] = (counts[destination] ?? 0) + 1
    }
    const wanted = { market: 0.3, entertainment: 0.25, park: 0.2, plaza: 0.15, civic: 0.1 }
    for (const [destination, share] of Object.entries(wanted))
      expect(counts[destination] / SAMPLE).toBeCloseTo(share, 1.5)
    expect(Object.keys(counts).sort()).toEqual(Object.keys(wanted).sort())
  })
})

describe.each(MOVER_FLOORS)('townTrips on %s', (_name, floor) => {
  const town = townOn(floor)
  const trips = townTrips(town)
  const citizens = citizensOf(trips)
  const vehicles = vehiclesOf(trips)
  const lotById = new Map(town.plan.lots.map((lot) => [lot.id, lot]))

  it.each(QUALITY_LEVELS)('sends out the movers its table gives the %s level', (detail) => {
    const sent = townTrips({ ...town, detail })
    expect(citizensOf(sent)).toHaveLength(MOVER_COUNTS[detail].citizens)
    expect(vehiclesOf(sent)).toHaveLength(MOVER_COUNTS[detail].vehicles)
    expect(kindsOf(citizensOf(sent)).size).toBeLessThanOrEqual(MOVER_COUNTS[detail].citizenKinds)
    expect(kindsOf(vehiclesOf(sent)).size).toBeLessThanOrEqual(MOVER_COUNTS[detail].vehicleKinds)
  })

  it('matches the design’s table', () => {
    expect(MOVER_COUNTS).toEqual({
      full: { citizens: 48, vehicles: 12, citizenKinds: 6, vehicleKinds: 4 },
      balanced: { citizens: 28, vehicles: 6, citizenKinds: 4, vehicleKinds: 2 },
      light: { citizens: 14, vehicles: 0, citizenKinds: 3, vehicleKinds: 0 }
    })
  })

  it('sends no vehicle when they are switched off', () => {
    expect(vehiclesOf(townTrips({ ...town, hasVehicles: false }))).toEqual([])
  })

  it('gives a smaller level the first of the same movers on the same routes', () => {
    for (const detail of ['balanced', 'light'] as const) {
      const fewer = townTrips({ ...town, detail })
      const routesOf = (sent: readonly Trip[]) =>
        sent.map(({ kind, route, speed, startSec }) => ({ kind, route, speed, startSec }))
      expect(routesOf(citizensOf(fewer))).toEqual(
        routesOf(citizens.slice(0, MOVER_COUNTS[detail].citizens))
      )
      expect(routesOf(vehiclesOf(fewer))).toEqual(
        routesOf(vehicles.slice(0, MOVER_COUNTS[detail].vehicles))
      )
    }
  })

  it('houses every citizen in a residential lot and dresses it as the lot’s owner', () => {
    for (const citizen of citizens) {
      const home = lotById.get(citizen.homeId ?? '')
      expect(home?.zone).toBe('residential')
      const owner = town.themeIdByZone.get(town.owners.get(home?.id ?? '') ?? '')
      expect([owner ?? town.floorThemeId, town.floorThemeId]).toContain(citizen.themeId)
    }
    // Some of them live by a company and wear its dress.
    expect(new Set(citizens.map((citizen) => citizen.themeId)).size).toBeGreaterThan(1)
  })

  it('walks each citizen a closed loop with a wait at each end', () => {
    for (const { route, speed, destination } of citizens) {
      expect(route.isLoop).toBe(true)
      expect(route.points.at(-1)).toEqual(route.points[0])
      expect(speed).toBeGreaterThanOrEqual(0.6)
      expect(speed).toBeLessThanOrEqual(1.2)
      const [away, home] = route.stops ?? []
      expect(away.sec).toBeGreaterThanOrEqual(8)
      expect(away.sec).toBeLessThanOrEqual(20)
      // A park and the plaza are out of doors; anywhere else the citizen goes in.
      expect(away.isIndoors).toBe(destination !== 'park' && destination !== 'plaza')
      expect(home).toMatchObject({ at: route.length, isIndoors: true })
      expect(home.sec).toBeGreaterThanOrEqual(4)
      expect(home.sec).toBeLessThanOrEqual(10)
    }
  })

  it('never puts a mover inside a lot, on the plate or in a company’s grounds', () => {
    const closed = [...town.plan.lots, floor, ...floor.zones]
    for (const trip of trips)
      for (const pose of lapOf(trip))
        expect(closed.find((rect) => isWithin(rect, pose))).toBeUndefined()
  })

  it('keeps every vehicle off the footpaths and on the right of its road', () => {
    const roads = town.plan.roads.map((road) => ({ road, strip: roadStrip(road) }))
    const driven = roads.filter(({ road }) => road.class !== 'lane')
    // Longer than any U-turn: a stretch along a road.
    const STRETCH_M = 7
    const campus = grow(town.plan.claim, -ROAD_WIDTH_M.boulevard)
    for (const vehicle of vehicles) {
      expect(vehicle.speed).toBeGreaterThanOrEqual(2.5)
      expect(vehicle.speed).toBeLessThanOrEqual(4)
      for (const pose of lapOf(vehicle)) {
        // The boulevard is the whole band inside the claim's edge, corners included.
        const isOnBoulevard = isOn(town.plan.claim, pose) && !isWithin(campus, pose)
        expect(isOnBoulevard || driven.some(({ strip }) => isOn(strip, pose))).toBe(true)
      }
      const { points } = vehicle.route
      for (let index = 1; index < points.length; index++) {
        const [from, to] = [points[index - 1], points[index]]
        const length = Math.hypot(to.x - from.x, to.z - from.z)
        if (length < STRETCH_M) continue
        const middle = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 }
        const isAlongX = from.z === to.z
        const under = driven.find(
          ({ road, strip }) => (road.from.z === road.to.z) === isAlongX && isWithin(strip, middle)
        )
        expect(under).toBeDefined()
        if (!under) continue
        // Facing the way it drives, the centre line is on its left.
        const toCentre = isAlongX ? under.road.from.z - middle.z : under.road.from.x - middle.x
        const heading = isAlongX ? Math.sign(to.x - from.x) : Math.sign(to.z - from.z)
        expect(Math.sign(toCentre) * heading * (isAlongX ? -1 : 1)).toBe(1)
      }
    }
  })

  it('loops transit round the boulevard’s outer lane and runs runabouts along the avenue', () => {
    const claim = boundsOfZone(town.plan.claim)
    const half = ROAD_WIDTH_M.boulevard / 2
    for (const tram of vehicles.filter((vehicle) => vehicle.kind === 'transit'))
      for (const pose of lapOf(tram)) {
        const fromEdge = Math.min(
          pose.x - claim.minX,
          claim.maxX - pose.x,
          pose.z - claim.minZ,
          claim.maxZ - pose.z
        )
        expect(fromEdge).toBeGreaterThan(0)
        expect(fromEdge).toBeLessThan(half)
      }
    const runabouts = vehicles.filter((vehicle) => vehicle.kind === 'runabout')
    expect(runabouts.length).toBeGreaterThan(0)
    for (const runabout of runabouts) {
      const lap = lapOf(runabout)
      for (const pose of lap) {
        expect(Math.abs(pose.z)).toBeLessThan(ROAD_WIDTH_M.avenue / 2)
        expect(pose.x).toBeLessThanOrEqual(claim.minX + ROAD_WIDTH_M.boulevard)
      }
      expect(Math.min(...lap.map((pose) => pose.x))).toBeLessThan(claim.minX - 48)
    }
  })

  it('runs freight from a workshop to a market and back, pausing at each', () => {
    const freight = vehicles.filter((vehicle) => vehicle.kind === 'freight')
    expect(freight.length).toBeGreaterThan(0)
    for (const { homeId, route, themeId } of freight) {
      const workshop = lotById.get(homeId ?? '')
      expect(workshop?.zone).toBe('workshop')
      const owner = town.themeIdByZone.get(town.owners.get(workshop?.id ?? '') ?? '')
      expect([owner ?? town.floorThemeId, town.floorThemeId]).toContain(themeId)
      expect(route.stops).toHaveLength(2)
      const market = lapOf({ ...({ route } as Trip) })[
        Math.floor((route.stops?.[0].at ?? 0) / 0.25)
      ]
      const nearest = Math.min(
        ...town.plan.lots
          .filter((lot) => lot.zone === 'market')
          .map((lot) => Math.hypot(lot.door.x - market.x, lot.door.z - market.z))
      )
      expect(nearest).toBeLessThan(ROAD_WIDTH_M.avenue / 2)
    }
  })

  it('gives the same plan the same trips', () => {
    expect(townTrips(townOn(floor))).toEqual(trips)
  })

  it('changes nothing when the campus grows without the claim stepping', () => {
    const wider = widened(floor, 1)
    const claim = campusClaim(neededClaim(wider), town.plan.claim)
    expect(claim).toEqual(town.plan.claim)
    const plan = townBlocks(claim, 'full')
    expect(townTrips({ ...town, plan, owners: lotOwners(plan, wider.zones) })).toEqual(trips)
  })
})
