import { expect, it } from 'vitest'
import { distributedTown } from '../town/distributed-town'
import { PAIR_FLOOR } from '../town/town.test-utils'
import { townOf } from '../town/use-town-plan'
import { contains } from './lot-math'
import { thinnedLots } from './lot-thinning'
import type { Lot } from './surroundings'

const floor = PAIR_FLOOR
// The town's own lots, and one on the plate, which a lighter level must never drop.
const onPlate: Lot = {
  id: 'on-plate',
  kind: 'prop',
  x: floor.x,
  z: floor.z,
  width: 1,
  depth: 1,
  maxHeight: 1,
  seed: 7
}
const lots: Lot[] = [...distributedTown(townOf(floor, null), [floor]).plan.lots, onPlate]
const isBeyond = (lot: Lot): boolean => !contains(floor, lot)
const beyondOf = (drawn: readonly Lot[]): Lot[] => drawn.filter(isBeyond)

it('draws every lot at a full share', () => {
  expect(thinnedLots(lots, 1, floor)).toEqual(lots)
})

it('draws the asked share of the lots beyond the plate', () => {
  const beyond = beyondOf(lots)
  expect(beyond.length).toBeGreaterThan(10)
  expect(beyondOf(thinnedLots(lots, 0.6, floor))).toHaveLength(Math.round(beyond.length * 0.6))
  expect(beyondOf(thinnedLots(lots, 0.3, floor))).toHaveLength(Math.round(beyond.length * 0.3))
  expect(beyondOf(thinnedLots(lots, 0, floor))).toHaveLength(0)
})

it('keeps every lot on the plate, whatever the share', () => {
  expect(thinnedLots(lots, 0, floor)).toEqual(lots.filter((lot) => !isBeyond(lot)))
  expect(thinnedLots(lots, 0, floor)).toContain(onPlate)
})

it('thins every side of the town instead of emptying one', () => {
  const kept = beyondOf(thinnedLots(lots, 0.3, floor))
  const sides = {
    west: kept.filter((lot) => lot.x < floor.x - floor.width / 2),
    east: kept.filter((lot) => lot.x > floor.x + floor.width / 2),
    north: kept.filter((lot) => lot.z < floor.z - floor.depth / 2),
    south: kept.filter((lot) => lot.z > floor.z + floor.depth / 2)
  }
  for (const [side, sideLots] of Object.entries(sides))
    expect(sideLots.length, side).toBeGreaterThan(0)
})

it('keeps at a lower share only lots it also keeps at a higher one', () => {
  const balanced = new Set(thinnedLots(lots, 0.6, floor).map((lot) => lot.id))
  for (const lot of thinnedLots(lots, 0.3, floor)) expect(balanced.has(lot.id), lot.id).toBe(true)
})

it('keeps the order of the lots, so a theme draws the same design on each', () => {
  const thinned = thinnedLots(lots, 0.6, floor)
  expect(thinned).toEqual(lots.filter((lot) => thinned.includes(lot)))
})
