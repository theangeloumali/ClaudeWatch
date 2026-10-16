import { describe, expect, it } from 'vitest'
import { MOVER_FLOORS, isOn, lapOf, poseAfter, townOn } from './movers.test-utils'
import { townTrips } from './town-trips'

const PROMENADE_SHARE = 0.6

describe.each(MOVER_FLOORS)('citizens of the city round %s', (_name, floor) => {
  const town = townOn(floor, 'full')
  const citizens = townTrips(town).filter((trip) => trip.kind === 'citizen')

  it('walk most of every route along a street or in a park', () => {
    const open = [...town.plan.promenades, ...town.plan.lots.filter((lot) => lot.zone === 'park')]
    expect(citizens.length).toBeGreaterThan(0)
    for (const citizen of citizens) {
      const lap = lapOf(citizen)
      const inTheOpen = lap.filter((pose) => open.some((rect) => isOn(rect, pose)))
      expect(inTheOpen.length / lap.length).toBeGreaterThanOrEqual(PROMENADE_SHARE)
    }
  })

  it('start out of doors, so a still town has its people in it', () => {
    for (const citizen of citizens) expect(poseAfter(citizen, 0).isIndoors).toBe(false)
  })
})
