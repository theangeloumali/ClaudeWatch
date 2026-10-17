import { expect, it } from 'vitest'
import { isWithin, lapOf } from '../movers.test-utils'
import { twoOfficeCity } from './pedestrian.test-utils'

// Where an office cuts a lot's street short, that lot's door lands on no kerb (two-office city).
it('never walks a citizen into an office to reach a lot whose street was cut short', () => {
  const { plan, trips } = twoOfficeCity()
  const citizens = trips.filter((trip) => trip.kind === 'citizen')
  expect(citizens.length).toBeGreaterThan(0)
  const intruders = citizens.filter((citizen) =>
    lapOf(citizen).some((pose) => plan.officeSites.some((office) => isWithin(office, pose)))
  )
  expect(intruders).toEqual([])
})
