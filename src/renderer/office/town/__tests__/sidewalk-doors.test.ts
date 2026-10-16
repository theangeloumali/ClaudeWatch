import { expect, it } from 'vitest'
import { crosswalks } from '../../../../shared/office/crosswalks'
import { attachDoor, sidewalkNetwork, sidewalkPath } from '../../../../shared/office/sidewalks'
import { liveCity } from './pedestrian.test-utils'

it('finds every lot door of the live city on its own sidewalk, reachable from the first', () => {
  const { plan } = liveCity()
  const network = sidewalkNetwork(plan.roads, crosswalks(plan.roads))
  const ids = plan.lots.map((lot) => attachDoor(network, lot.door))
  expect(ids.length).toBeGreaterThan(0)
  expect(network.edges.filter((edge) => edge.kind === 'hop')).toEqual([])
  const unreachable = ids.filter((id) => !sidewalkPath(network, ids[0], id))
  expect(unreachable).toEqual([])
})
