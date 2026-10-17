import { describe, expect, it } from 'vitest'
import { LIVE_FLOORS } from '../themes/floors.test-utils'
import { gapBetween } from '../themes/lot-math'
import { GUARDED_CITIES } from './__tests__/town-plan-guard.test-utils'
import { distributedTown } from './distributed-town'
import { townDressOf } from './drawn-town.test-utils'
import { dressTown } from './open-lots'
import type { TownLot } from './town-lots'
import { LANDMARK_DISTRICTS } from './town-zones'
import { townOf } from './use-town-plan'

const [, TWO_OFFICES, OFFICE_SITES] = GUARDED_CITIES[0]
const { plan } = distributedTown(townOf(TWO_OFFICES, null), OFFICE_SITES)
const areaOf = (lot: TownLot): number => lot.width * lot.depth

describe('the landmarks of the two-office city', () => {
  it('the city has a workshop and an entertainment landmark', () => {
    const zones = plan.lots.filter((lot) => lot.isLandmark).map((lot) => lot.zone)
    expect(zones).toContain('workshop')
    expect(zones).toContain('entertainment')
  })

  it('marks one landmark per landmark district, on its largest lot, and none elsewhere', () => {
    for (const zone of new Set(plan.lots.map((lot) => lot.zone))) {
      const inZone = plan.lots.filter((lot) => lot.zone === zone)
      const landmarks = inZone.filter((lot) => lot.isLandmark)
      if (!LANDMARK_DISTRICTS.includes(zone)) {
        expect(landmarks, zone).toEqual([])
        continue
      }
      expect(landmarks, zone).toHaveLength(1)
      expect(areaOf(landmarks[0])).toBe(Math.max(...inZone.map(areaOf)))
    }
  })

  // The slope rule counts the sites that are offices, the floors with zones on them.
  it.each(LIVE_FLOORS)('keeps every lot of %s under the slope rule near its office', (_, floor) => {
    for (const lot of distributedTown(townOf(floor, null), [floor]).plan.lots)
      expect(lot.maxHeight, lot.id).toBeLessThanOrEqual(
        Math.max(8, gapBetween(lot, floor) * 0.7 + 4)
      )
  })

  it('the Garrison city draws its radar tower', () => {
    const dress = townDressOf('orbital-garrison')
    const drawn = dressTown(plan, dress).map((placed) => placed.design)
    expect(drawn).toContain('radar-tower')
  })

  it('draws the Garrison workshop and entertainment landmarks on their lots', () => {
    const dress = townDressOf('orbital-garrison')
    const landmarkOf = (zone: TownLot['zone']) => {
      const lot = plan.lots.find((each) => each.isLandmark && each.zone === zone)
      return dressTown(plan, dress).find((placed) => placed.lot === lot)?.design
    }
    expect(landmarkOf('workshop')).toBe('fleet-hangar')
    expect(landmarkOf('entertainment')).toBe('canteen-dome')
  })
})
