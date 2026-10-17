import { describe, expect, it } from 'vitest'
import { lotsWithDoors } from '../town-lots'
import { twoOfficeCity } from './pedestrian.test-utils'

describe('lotsWithDoors', () => {
  // Locale collation puts `a` before `B`; code-unit order, the same on every machine, does not.
  it('orders lots by code unit, not by locale', () => {
    const [first, second] = lotsWithDoors(twoOfficeCity().plan.lots)
    const lots = [
      { ...first, id: 'lot:a' },
      { ...second, id: 'lot:B' }
    ]
    expect(lotsWithDoors(lots).map((lot) => lot.id)).toEqual(['lot:B', 'lot:a'])
  })
})
