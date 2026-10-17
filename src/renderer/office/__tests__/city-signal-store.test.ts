import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AgentObservation, SessionRef, SessionUsage } from '../../../shared/office/types'
import { buildingIdOf } from '../logic/city-signals'
import { createCitySignalStore, useSpireStages } from '../logic/city-signal-store'
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
  makeSession({ key, observation: FRESH, usage: null, startedAtMs: NOW - 3_600_000, ...overrides })

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

  it('tells a subscriber once per change, and nothing while the signals stand still', () => {
    const store = createCitySignalStore()
    let heard = 0
    const stop = store.subscribe(() => (heard += 1))
    store.update(makeFrame({ sessions: [live('claude:a')] }), NOW)
    store.update(makeFrame({ sessions: [live('claude:a')] }), NOW + 500)
    store.update(makeFrame({ sessions: [live('claude:a', { attention: 'permission' })] }), NOW)
    stop()
    store.update(makeFrame({ sessions: [live('claude:a')] }), NOW)
    expect(heard).toBe(2)
  })

  it("today's tokens rising alone move the HUD's version, never the scene's", () => {
    const store = createCitySignalStore()
    const spent = (tokens: number) =>
      makeFrame({ sessions: [live('claude:a')], projectsToday: [{ projectKey: 'p_1', tokens }] })
    store.update(spent(1_200_000), NOW)
    const [version, sceneVersion] = [store.version(), store.sceneVersion()]
    store.update(spent(1_300_000), NOW + 500)
    expect(store.version()).toBe(version + 1)
    expect(store.sceneVersion()).toBe(sceneVersion)
    store.update(spent(2_100_000), NOW + 1_000)
    expect(store.sceneVersion()).toBe(sceneVersion + 1)
  })

  it('the scene version moves when a building changes state', () => {
    const store = createCitySignalStore()
    store.update(makeFrame({ sessions: [live('claude:a')] }), NOW)
    const sceneVersion = store.sceneVersion()
    store.update(makeFrame({ sessions: [live('claude:a', { attention: 'permission' })] }), NOW)
    expect(store.sceneVersion()).toBe(sceneVersion + 1)
  })

  it('holds no signals before the first frame', () => {
    const store = createCitySignalStore()
    expect(store.current().buildings.size).toBe(0)
    store.update(null, NOW)
    expect(store.current().leaders.crowned).toEqual([])
  })
})

describe('useSpireStages', () => {
  it('keeps the same Map until a stage changes', () => {
    const store = createCitySignalStore()
    const frame = (tokens: number, overrides: Partial<SessionRef> = {}) =>
      makeFrame({
        sessions: [live('claude:a', overrides)],
        projectsToday: [{ projectKey: 'p_1', tokens }]
      })
    store.update(frame(1_200_000), NOW)
    const { result, rerender } = renderHook(() => useSpireStages(store))
    const first = result.current
    expect([...first]).toEqual([[HOME, 1]])
    act(() => store.update(frame(1_300_000, { attention: 'permission' }), NOW))
    rerender()
    expect(result.current).toBe(first)
    act(() => store.update(frame(2_100_000), NOW))
    expect([...result.current]).toEqual([[HOME, 2]])
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
