import { expect, it } from 'vitest'
import { World } from '../world'
import { session } from '../fixtures'

it('keeps healthy idle dwell through fresh observations received before the next movement tick', () => {
  let nowMs = 1000
  const world = new World({ ...{ now: () => nowMs } })
  const record = () => ({
    ...session('claude:idle'),
    observation: {
      sourceId: 'test-source',
      observedAtMs: nowMs,
      staleAfterMs: 60000,
      coverage: 'own' as const
    }
  })
  const sources = () => [
    { id: 'test-source', ok: true, detail: 'healthy', checkedAtMs: nowMs, staleAfterMs: 60000 }
  ]
  world.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 0, generatedAtMs: nowMs, sessions: [record()], sources: sources() }
  })
  let hasVisited = false
  for (let tick = 1; tick <= 600; tick++) {
    nowMs += 100
    if (tick % 20 === 0)
      world.apply({
        type: 'patch',
        v: 1,
        seq: tick,
        upserts: [record()],
        removed: [],
        sources: sources()
      })
    hasVisited ||= world.step(100).some((agent) => agent.place === 'lounge')
  }
  expect(hasVisited).toBe(true)
})
