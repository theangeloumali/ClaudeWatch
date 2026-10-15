import { describe, expect, it } from 'vitest'
import { QUALITY_LEVELS } from '../../logic/quality'
import { townOn } from '../../town/movers.test-utils'
import { LARGE_FLOOR } from '../../town/town.test-utils'
import { MOVER_COUNTS, townTrips } from '../../town/town-trips'

describe('mixed-theme freight with a distinct floor default', () => {
  it.each(QUALITY_LEVELS)(
    'reserves the floor fallback inside the %s vehicle draw budget',
    (detail) => {
      const town = { ...townOn(LARGE_FLOOR, detail), floorThemeId: 'corporate-city' }
      expect([...town.themeIdByZone.values()]).not.toContain(town.floorThemeId)
      const vehicles = townTrips(town).filter((trip) => trip.kind !== 'citizen')
      const kinds = new Set(vehicles.map((trip) => `${trip.kind}:${trip.themeId}:${trip.figure}`))
      expect(kinds.size).toBeLessThanOrEqual(MOVER_COUNTS[detail].vehicleKinds)
      expect(vehicles).toHaveLength(MOVER_COUNTS[detail].vehicles)
    }
  )
})
