import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AgentObservation, SessionRef, SessionUsage } from '../../../shared/office/types'
import { buildingIdOf } from '../logic/city-signals'
import { createCitySignalStore } from '../logic/city-signal-store'
import { useCitySignalFeed } from '../use-office-model'
import { makeFrame, makeSession } from './fixtures'

const NOW = new Date(2026, 9, 17, 12).getTime()
const HOME = buildingIdOf('c_test', 'p_1')
const FRESH: AgentObservation = {
  sourceId: 'claude',
  observedAtMs: NOW - 1_000,
  staleAfterMs: 60_000,
  coverage: 'own'
}
const usage = (input: number): SessionUsage => ({
  own: { input, output: 0, cacheWrite: 0, cacheRead: 0 },
  subagents: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
  spawned: 0,
  contextTokens: null,
  contextLimit: null
})
const live = (key: string, overrides: Partial<SessionRef> = {}): SessionRef =>
  makeSession({ key, observation: FRESH, usage: null, ...overrides })

describe('city signal store', () => {
  it('keeps its version while the evidence says the same thing', () => {
    const store = createCitySignalStore()
    const frame = makeFrame({ sessions: [live('claude:a')] })
    store.update(frame, NOW)
    const version = store.version()
    store.update(makeFrame({ sessions: [live('claude:a')] }), NOW + 500)
    expect(store.version()).toBe(version)
  })

  it('bumps its version once when a building changes state', () => {
    const store = createCitySignalStore()
    store.update(makeFrame({ sessions: [live('claude:a')] }), NOW)
    const version = store.version()
    store.update(makeFrame({ sessions: [live('claude:a', { attention: 'permission' })] }), NOW)
    expect(store.version()).toBe(version + 1)
    expect(store.current().buildings.get(HOME)?.needsYou).toBe(true)
  })

  it('remembers the day across frames, so an ended session leaves its building standing', () => {
    const store = createCitySignalStore()
    store.update(makeFrame({ sessions: [live('claude:a', { usage: usage(3e6) })] }), NOW)
    const home = store.current().buildings.get(HOME)
    store.update(makeFrame({ floors: [], sessions: [] }), NOW + 1_000)
    store.update(makeFrame({ sessions: [live('claude:b')] }), NOW + 2_000)
    expect(home?.spireStage).toBe(store.current().buildings.get(HOME)?.spireStage)
  })

  it('holds no signals before the first frame', () => {
    const store = createCitySignalStore()
    expect(store.current().buildings.size).toBe(0)
    store.update(null, NOW)
    expect(store.current().leaders.crowned).toEqual([])
  })
})

describe('the Office root feeds the city signals', () => {
  it('a new frame reaches the store, and a re-render with the same frame bumps nothing', () => {
    const store = createCitySignalStore()
    const asking = makeFrame({ sessions: [live('claude:a', { attention: 'permission' })] })
    const { rerender } = renderHook(({ frame, nowMs }) => useCitySignalFeed(frame, nowMs, store), {
      initialProps: { frame: asking, nowMs: NOW }
    })
    expect(store.current().buildings.get(HOME)?.needsYou).toBe(true)
    const version = store.version()
    rerender({ frame: asking, nowMs: NOW })
    expect(store.version()).toBe(version)
  })
})
