import { describe, expect, it } from 'vitest'
import { isSameMap } from '../logic/same-map'

describe('isSameMap', () => {
  it('holds when every key has a same value, and a null value still counts as held', () => {
    const map = new Map([
      ['a', 1],
      ['b', null]
    ])
    expect(isSameMap(map, new Map(map), Object.is)).toBe(true)
    expect(isSameMap(map, new Map([['a', 1]]), Object.is)).toBe(false)
    expect(
      isSameMap(
        map,
        new Map([
          ['a', 1],
          ['c', null]
        ]),
        Object.is
      )
    ).toBe(false)
    expect(isSameMap(new Map([['a', 1]]), new Map([['a', 2]]), Object.is)).toBe(false)
  })
})
