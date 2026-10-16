import { describe, expect, it } from 'vitest'
import { waitCycleLeaders } from '../worker-navigation'

const waits = (edges: Record<string, string>) => new Map(Object.entries(edges))

describe('wait cycle leaders', () => {
  it('leaves an ordinary queue alone', () => {
    expect(waitCycleLeaders(waits({ c: 'b', b: 'a' }))).toEqual(new Set())
  })

  it('lets the lowest id of a mutual wait proceed', () => {
    expect(waitCycleLeaders(waits({ b: 'a', a: 'b' }))).toEqual(new Set(['a']))
  })

  it('picks only from the cycle, never from the queue behind it', () => {
    expect(waitCycleLeaders(waits({ a: 'c', c: 'd', d: 'c' }))).toEqual(new Set(['c']))
  })

  it('passes over a member that cannot step, and holds a cycle where none can', () => {
    const pinned = new Set(['a', 'x', 'y'])
    const canStep = (id: string) => !pinned.has(id)
    expect(waitCycleLeaders(waits({ a: 'b', b: 'c', c: 'a' }), canStep)).toEqual(new Set(['b']))
    expect(waitCycleLeaders(waits({ x: 'y', y: 'x' }), canStep)).toEqual(new Set())
  })

  it('breaks every separate cycle once', () => {
    expect(waitCycleLeaders(waits({ x: 'y', y: 'z', z: 'x', q: 'p', p: 'q', r: 'p' }))).toEqual(
      new Set(['p', 'x'])
    )
  })
})
