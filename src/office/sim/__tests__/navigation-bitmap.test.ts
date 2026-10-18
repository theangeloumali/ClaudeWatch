import { expect, it } from 'vitest'
import { findPath } from '../path'

it('uses an equivalent numeric occupancy map without parsing wall strings on every crowd repath', () => {
  const grid = {
    width: 8,
    height: 8,
    cellSize: 1,
    origin: { x: 0, z: 0 },
    blocked: ['3,0', '3,1', '3,2', '3,3', '3,4']
  }
  const from = { x: 1, z: 1 },
    to = { x: 6, z: 1 }
  const expected = findPath(grid, from, to)
  const blockedCells = new Uint8Array(64)
  for (let row = 0; row <= 4; row++) blockedCells[row * 8 + 3] = 1
  const before = [...blockedCells]
  const result = findPath({ ...grid, blocked: [], blockedCells }, from, to)
  expect(result).toEqual(expected)
  expect([...blockedCells]).toEqual(before)
})
