import { describe, expect, it } from 'vitest'
import { LIVE_FLOORS } from '../themes/floors.test-utils'
import { townOn } from './movers.test-utils'
import { TOWN_SIZES, type TownSize } from './town-grid'
import { townTrips } from './town-trips'
import { townOf } from './use-town-plan'

const SMALLER_FIRST: readonly (readonly [TownSize, TownSize])[] = [
  ['village', 'town'],
  ['town', 'city']
]

describe.each(LIVE_FLOORS)('the town size on %s', (_name, floor) => {
  const trips = Object.fromEntries(
    TOWN_SIZES.map((size) => [size, townTrips(townOn(floor, 'full', size))] as const)
  )
  const count = (size: TownSize, kind: 'citizen' | 'vehicle') =>
    trips[size].filter((trip) => (kind === 'citizen') === (trip.kind === 'citizen')).length

  it.each(SMALLER_FIRST)('sends out fewer movers in a %s than in a %s', (small, large) => {
    expect(count(small, 'citizen')).toBeLessThan(count(large, 'citizen'))
    expect(count(small, 'vehicle')).toBeLessThan(count(large, 'vehicle'))
  })

  it('keeps a tram, a cart and a runabout in a village at full detail', () => {
    const roles = new Set(trips.village.map((trip) => trip.kind))
    expect(roles).toEqual(new Set(['citizen', 'transit', 'freight', 'runabout']))
  })

  it('keeps the claim whatever the size', () => {
    const towns = TOWN_SIZES.map((size) => townOf(floor, null, size))
    for (const town of towns) expect(town.claim).toEqual(towns[0].claim)
  })
})
