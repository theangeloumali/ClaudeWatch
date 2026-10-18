import { expect, it } from 'vitest'
import { crosswalks } from '../../../../shared/office/crosswalks'
import { attachDoor, sidewalkNetwork, sidewalkPath } from '../../../../shared/office/sidewalks'
import { isWithin, lapOf } from '../movers.test-utils'
import { liveCity, twoOfficeCity } from './pedestrian.test-utils'

it('finds every lot door of the live city on its own sidewalk, reachable from the first', () => {
  const { plan } = liveCity()
  const network = sidewalkNetwork(plan.roads, crosswalks(plan.roads))
  const ids = plan.lots.map((lot) => attachDoor(network, lot.door))
  expect(ids.length).toBeGreaterThan(0)
  expect(network.edges.filter((edge) => edge.kind === 'hop')).toEqual([])
  const unreachable = ids.filter((id) => !sidewalkPath(network, ids[0], id))
  expect(unreachable).toEqual([])
})

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
