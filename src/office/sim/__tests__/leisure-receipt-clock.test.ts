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

it('freezes new leisure choices on resync and failed own source', () => {
  const actor = {
    ...session('actor'),
    attention: 'done' as const,
    observation: {
      sourceId: 'source',
      coverage: 'own' as const,
      observedAtMs: 0,
      staleAfterMs: 100_000
    }
  }
  const world = new World()
  world.apply({
    type: 'hello',
    v: 1,
    snapshot: {
      rev: 1,
      generatedAtMs: 0,
      sessions: [actor],
      sources: [{ id: 'source', ok: false, detail: 'offline' }]
    }
  })
  for (let tick = 0; tick < 250; tick++) world.step(100)
  expect(world.step(0)[0].place).toBeUndefined()
  world.apply({ type: 'resync' })
  for (let tick = 0; tick < 250; tick++) world.step(100)
  expect(world.step(0)).toHaveLength(1)
  expect(world.step(0)[0]).toMatchObject({
    agentKey: actor.key,
    attention: 'done',
    activity: 'idle'
  })
  expect(world.step(0)[0].place).toBeUndefined()
})
