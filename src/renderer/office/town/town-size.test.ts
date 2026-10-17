import { describe, expect, it } from 'vitest'
import { LIVE_FLOORS } from '../themes/floors.test-utils'
import { townOn } from './movers.test-utils'
import { TOWN_SIZES, type TownSize } from './town-grid'
import { planTown, townBlocks, townExtent } from './town-plan'
import { townTrips } from './town-trips'
import { TOWN_DISTRICTS } from './town-zones'
import { townOf } from './use-town-plan'
import { campusClaim, neededClaim } from './town-claim'
import { edges } from './town.test-utils'

const SMALLER_FIRST: readonly (readonly [TownSize, TownSize])[] = [
  ['village', 'town'],
  ['town', 'city']
]

describe.each(LIVE_FLOORS)('the town size on %s', (_name, floor) => {
  const claim = campusClaim(neededClaim(floor), null)
  const plans = Object.fromEntries(
    TOWN_SIZES.map((size) => [size, planTown(claim, 'full', size)] as const)
  )
  const trips = Object.fromEntries(
    TOWN_SIZES.map((size) => [size, townTrips(townOn(floor, 'full', size))] as const)
  )
  const count = (size: TownSize, kind: 'citizen' | 'vehicle') =>
    trips[size].filter((trip) => (kind === 'citizen') === (trip.kind === 'citizen')).length

  it.each(SMALLER_FIRST)('gives a %s fewer lots, roads and movers than a %s', (small, large) => {
    expect(plans[small].lots.length).toBeLessThan(plans[large].lots.length)
    expect(plans[small].roads.length).toBeLessThan(plans[large].roads.length)
    expect(count(small, 'citizen')).toBeLessThan(count(large, 'citizen'))
    expect(count(small, 'vehicle')).toBeLessThan(count(large, 'vehicle'))
  })

  it.each(SMALLER_FIRST)('draws a %s inside the extent of a %s', (small, large) => {
    const inner = edges(plans[small].extent)
    const outer = edges(plans[large].extent)
    expect(inner.west).toBeGreaterThanOrEqual(outer.west)
    expect(inner.north).toBeGreaterThan(outer.north)
    expect(inner.east).toBeLessThan(outer.east)
    expect(inner.south).toBeLessThan(outer.south)
    expect(plans[small].extent).toEqual(townExtent(claim, 'full', small))
  })

  it('keeps every district in a village, so it still reads as zoned', () => {
    const zones = new Set(plans.village.lots.map((lot) => lot.zone))
    expect([...zones].sort()).toEqual([...TOWN_DISTRICTS].sort())
  })

  it('keeps a tram, a cart and a runabout in a village at full detail', () => {
    const roles = new Set(trips.village.map((trip) => trip.kind))
    expect(roles).toEqual(new Set(['citizen', 'transit', 'freight', 'runabout']))
  })

  it('runs the roads of a village to its rim', () => {
    const rim = edges(plans.village.extent)
    const reach = plans.village.roads.flatMap((road) => [road.from, road.to])
    expect(Math.min(...reach.map((point) => point.x))).toBe(rim.west)
    expect(Math.max(...reach.map((point) => point.x))).toBe(rim.east)
  })

  it('keeps the claim whatever the size', () => {
    const towns = TOWN_SIZES.map((size) => townOf(floor, null, size))
    for (const town of towns) expect(town.claim).toEqual(towns[0].claim)
  })

  it('is today’s full town as a city', () => {
    expect(planTown(claim, 'full', 'city')).toEqual({ ...planTown(claim, 'full'), size: 'city' })
  })

  it('lets the detail level thin within the size, never widen it', () => {
    expect(edges(townExtent(claim, 'light', 'city'))).toEqual(
      edges(townExtent(claim, 'full', 'village'))
    )
    const lightTown = planTown(claim, 'light', 'town')
    expect(lightTown.lots.length).toBeLessThanOrEqual(plans.town.lots.length)
  })

  it('remembers a plan by claim, detail and size', () => {
    expect(townBlocks(claim, 'full', 'village')).toBe(townBlocks(claim, 'full', 'village'))
    expect(townBlocks(claim, 'full', 'village')).not.toBe(townBlocks(claim, 'full', 'town'))
  })
})
