import { expect, it } from 'vitest'
import { WORKER_BODY_RADIUS } from '../../../shared/office/body-footprints'
import { makeAgent } from '../__tests__/fixtures'
import { SceneBodies } from './BodySpace'

it('places a worker from its view alone, and keeps the connector a visitor rides', () => {
  const bodies = new SceneBodies()
  bodies.setWorkers([makeAgent({ agentKey: 'a', x: 1, z: 2 })])
  bodies.set({ id: 'owner-player', x: 0, z: 0, elevation: 4, connectorId: 'lift', radius: 0.3 })
  expect(bodies.workers).toStrictEqual([
    { id: 'a', x: 1, z: 2, elevation: 0, radius: WORKER_BODY_RADIUS }
  ])
  expect(bodies.external()).toEqual([expect.objectContaining({ connectorId: 'lift' })])
})
