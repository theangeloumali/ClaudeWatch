import { describe, expect, it, vi } from 'vitest'
import { CITY_MAIN_CORRIDOR_METRES } from '../../../shared/office/city-block-layout'
import { QUALITY_LEVELS } from '../logic/quality'
import { hashOf } from '../themes/lot-math'
import { MOVER_FLOORS, isOn, isWithin, lapOf, townOn } from './movers.test-utils'
import { MOVER_COUNTS, destinationOf, townTrips, type Trip } from './town-trips'
import { roadStrip } from './town.test-utils'
import { liveCity } from './__tests__/pedestrian.test-utils'

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
  // Every fourth citizen strolls a block instead of going anywhere (citizen-trips).
  const walkers = citizens.filter((citizen) => citizen.homeId !== null)

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

  it('houses every walker in a residential lot, strollers in none, all in the floor’s dress', () => {
    expect(walkers.length).toBeGreaterThan(0)
    for (const citizen of citizens) expect(citizen.themeId).toBe(town.floorThemeId)
    for (const walker of walkers) expect(lotById.get(walker.homeId ?? '')?.zone).toBe('residential')
  })

  it('strolls a city block round and round, with no stop and no home', () => {
    const strollers = citizens.filter((citizen) => citizen.homeId === null)
    expect(strollers.length).toBeGreaterThan(0)
    for (const { route } of strollers) {
      expect(route.isLoop).toBe(true)
      expect(route.stops).toBeUndefined()
    }
  })

  it('walks each walker a closed loop with a wait at each end', () => {
    for (const { route, speed, destination } of walkers) {
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
      // At the kerb opposite, at most: the city keeps left, so a door may be across an avenue.
      expect(nearest).toBeLessThan(CITY_MAIN_CORRIDOR_METRES)
    }
  })

  it('gives the same plan the same trips', () => {
    expect(townTrips(townOn(floor))).toEqual(trips)
  })
})

// On the live city: elsewhere an outer lane leaves the paving where two streets end at a corner.
describe('vehicles in the live city', () => {
  it('keeps every vehicle off the footpaths and on the left of its road', () => {
    const { plan, trips } = liveCity()
    const vehicles = vehiclesOf(trips)
    const roads = plan.roads.map((road) => ({ road, strip: roadStrip(road) }))
    const driven = roads.filter(({ road }) => road.class !== 'lane')
    // Longer than a U-turn across the city's 18 m avenue, lane to lane (11.25 m).
    const STRETCH_M = 12
    expect(vehicles.length).toBeGreaterThan(0)
    for (const vehicle of vehicles) {
      expect(vehicle.speed).toBeGreaterThanOrEqual(2.5)
      expect(vehicle.speed).toBeLessThanOrEqual(4)
      for (const pose of lapOf(vehicle))
        expect(driven.some(({ strip }) => isOn(strip, pose))).toBe(true)
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
        // Facing the way it drives, the centre line is on its right: the city keeps left (A3).
        const toCentre = isAlongX ? under.road.from.z - middle.z : under.road.from.x - middle.x
        const heading = isAlongX ? Math.sign(to.x - from.x) : Math.sign(to.z - from.z)
        expect(Math.sign(toCentre) * heading * (isAlongX ? -1 : 1)).toBe(-1)
      }
    }
  })
})
