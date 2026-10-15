import { expect, it } from 'vitest'
import { makeFloor } from '../fixtures'
import { distributedTown } from '../../town/distributed-town'
import { townOf } from '../../town/use-town-plan'

it('provides street access to an office outside the old fixed 144 metre grid', () => {
  const envelope = makeFloor({ floorId: 'district', x: 350, z: 0, width: 120, depth: 100 })
  const entrance = { x: 360, z: -12.5 }
  const building = { x: 360, z: 0, width: 30, depth: 25, entrance }
  const town = distributedTown(townOf(envelope, null, 'full'), [building])
  const distances = town.plan.roads.map(({ from, to }) => {
    const x = Math.max(Math.min(from.x, to.x), Math.min(entrance.x, Math.max(from.x, to.x)))
    const z = Math.max(Math.min(from.z, to.z), Math.min(entrance.z, Math.max(from.z, to.z)))
    return Math.hypot(entrance.x - x, entrance.z - z)
  })
  expect(Math.min(...distances)).toBeLessThanOrEqual(12)
})
