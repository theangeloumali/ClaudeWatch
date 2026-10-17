import { expect, it, vi } from 'vitest'
import type { SessionRef } from '../../shared/office/types'
import { session } from './fixtures'
import { findPath } from './path'
import { World } from './world'

vi.mock('./path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./path')>()
  return { ...actual, findPath: vi.fn(actual.findPath) }
})

// Longer than any walk on this small floor, the lounge delay included.
const SETTLE_MS = 120_000

const done = (key: string): SessionRef => ({ ...session(key), attention: 'done' })
let seq = 0
const patch = (sim: World, upserts: SessionRef[], removed: string[] = []) =>
  sim.apply({ type: 'patch', v: 1, seq: ++seq, upserts, removed })
const settle = (sim: World) => {
  for (let elapsed = 0; elapsed < SETTLE_MS; elapsed += 100) sim.step(100)
}

it('keeps the routes already found while a patch leaves the floor as it was', () => {
  const sim = new World()
  sim.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 0, generatedAtMs: 0, sessions: [done('a')], sources: [] }
  })
  // To the lounge and back once, so both routes are known.
  settle(sim)
  patch(sim, [session('a')])
  settle(sim)
  vi.mocked(findPath).mockClear()

  patch(sim, [done('a')])
  settle(sim)
  patch(sim, [session('a')])
  settle(sim)
  expect(sim.step(0)[0].place).toBeUndefined()
  expect(findPath).not.toHaveBeenCalled()
})

it('finds new routes once the floor changes', () => {
  const sim = new World()
  sim.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 0, generatedAtMs: 0, sessions: [done('a')], sources: [] }
  })
  // The same round trip as above, but a newcomer changes the floor before it.
  settle(sim)
  patch(sim, [session('a')])
  settle(sim)
  vi.mocked(findPath).mockClear()

  patch(sim, [done('a'), session('b')])
  settle(sim)
  expect(findPath).toHaveBeenCalled()
})
