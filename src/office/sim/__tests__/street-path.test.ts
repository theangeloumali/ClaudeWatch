import { expect, it } from 'vitest'
import { streetPath } from '../street-path'

it('routes a street around a building without a city occupancy bitmap', () => {
  const route = streetPath({
    from: { x: -10, z: 0 },
    to: { x: 10, z: 0 },
    blocks: [{ x: 0, z: 0, width: 4, depth: 4 }]
  })
  expect(route[0]).toEqual({ x: -10, z: 0 })
  expect(route.at(-1)).toEqual({ x: 10, z: 0 })
  expect(route.some((point) => Math.abs(point.z) > 2.8)).toBe(true)
})
