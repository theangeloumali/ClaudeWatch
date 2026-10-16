import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ambientLoops } from '../../../../shared/office/sidewalks'
import { citySidewalks } from '../../citizens/city-sidewalks'
import { MoverLayer } from '../../citizens/MoverLayer'
import type { QualityLevel } from '../../logic/quality'
import { pinQuality } from '../../quality-store'
import { SceneBodies } from '../../scene/BodySpace'
import { getTheme } from '../../themes/registry'
import { MOVER_COUNTS, townTrips } from '../town-trips'
import { isAsphalt, liveCity, roadSurface } from './pedestrian.test-utils'

const frames = vi.hoisted(() => ({
  latest: undefined as ((state: unknown, deltaSec: number) => void) | undefined
}))
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: (state: unknown, deltaSec: number) => void) => {
    frames.latest = callback
  }
}))

const FRAME_SEC = 1 / 20

afterEach(() => pinQuality('full'))

describe('ambient sidewalk loops (citizens-8)', () => {
  it('sends a quarter of the city’s citizens round a block on its sidewalks', () => {
    const { plan, trips } = liveCity()
    const sidewalks = citySidewalks(plan)
    if (!sidewalks) throw new Error('The live city has no sidewalks')
    const loops = ambientLoops(sidewalks.network)
    const citizens = trips.filter((trip) => trip.kind === 'citizen')
    const ambient = citizens.filter((trip) => trip.destination === null)
    expect(ambient).toHaveLength(Math.floor(citizens.length / 4))
    for (const trip of ambient) {
      expect(loops).toContainEqual(trip.route.points)
      expect(trip.route.stops ?? []).toEqual([])
    }
  })

  it('walks the first of the same citizens at a lighter level', () => {
    const { plan } = liveCity()
    const routesAt = (detail: QualityLevel) =>
      townTrips({
        plan,
        owners: new Map(),
        floorThemeId: 'corporate-city',
        themeIdByZone: new Map(),
        detail
      })
        .filter((trip) => trip.kind === 'citizen')
        .map((trip) => trip.route)
    const full = routesAt('full')
    const light = routesAt('light')
    expect(light.length).toBeGreaterThan(0)
    expect(light).toEqual(full.slice(0, light.length))
  })
})

describe('the crowd across a quality step (Review Focus 3)', () => {
  it('keeps no stale walker and spawns nobody on asphalt from full to light and back', () => {
    pinQuality('full')
    const city = liveCity()
    const spotOf = roadSurface(city.plan)
    const bodies = new SceneBodies()
    const props = {
      floor: city.floor,
      plan: city.plan,
      owners: new Map<string, string>(),
      floorTheme: getTheme('corporate-city'),
      zoneGroups: [],
      player: null,
      isReducedMotion: false,
      hasVehicles: true,
      bodies
    }
    renderHook(() => MoverLayer(props))
    const walkFor = (seconds: number) => {
      for (let frame = 0; frame < seconds / FRAME_SEC; frame++) frames.latest?.({}, FRAME_SEC)
    }
    const walkers = () => bodies.external().filter((body) => body.id.startsWith('citizen:'))
    const onAsphalt = () => walkers().filter((body) => isAsphalt(spotOf(body)))

    const atStart = new Map(walkers().map((body) => [body.id, body]))
    walkFor(30)
    const midWalk = new Map(walkers().map((body) => [body.id, body]))
    const hasWalked = [...midWalk].some(([id, body]) => {
      const start = atStart.get(id)
      return start !== undefined && (start.x !== body.x || start.z !== body.z)
    })
    expect(hasWalked).toBe(true)
    act(() => pinQuality('light'))
    const lightCount = MOVER_COUNTS.light.citizens
    const stale = walkers().filter((body) => Number(body.id.split(':')[1]) >= lightCount)
    expect(stale).toEqual([])
    expect(walkers().length).toBeGreaterThan(0)
    expect(onAsphalt()).toEqual([])
    for (const body of walkers())
      if (midWalk.has(body.id)) expect(body).toEqual(midWalk.get(body.id))
    walkFor(15)
    expect(onAsphalt()).toEqual([])

    act(() => pinQuality('full'))
    expect(onAsphalt()).toEqual([])
    walkFor(15)
    expect(onAsphalt()).toEqual([])
  }, 120_000)
})
