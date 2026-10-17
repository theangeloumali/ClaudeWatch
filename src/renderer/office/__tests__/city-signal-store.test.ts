import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  // Maya's repro: turning account watching off mid-day sends a hello with no day totals.
  it("a hello without the host's day totals keeps every spire it already raised", () => {
    const store = createCitySignalStore()
    const session = live('claude:a', { startedAtMs: NOW - 60_000, usage: usage(100_000) })
    // The host's ledger also counts this morning's ended session: 4M today.
    const withToday = makeFrame({
      sessions: [session],
      projectsToday: [{ projectKey: 'p_1', tokens: 4e6 }]
    })
    store.update(withToday, NOW)
    const before = store.current().buildings.get(HOME)
    expect(before?.spireStage).toBeGreaterThan(0)
    store.update(makeFrame({ sessions: [session] }), NOW + 1_000)
    expect(store.current().buildings.get(HOME)?.spireStage).toBe(before?.spireStage)
    expect(store.current().buildings.get(HOME)?.tokensToday).toBe(before?.tokensToday)
  })

  it("a known project the host's day totals leave out spent 0 today, not unknown", () => {
    const store = createCitySignalStore()
    const idleHere = (projectsToday?: { projectKey: string; tokens: number }[]) =>
      makeFrame({ sessions: [live('claude:a')], ...(projectsToday && { projectsToday }) })
    store.update(idleHere(), NOW)
    expect(store.current().buildings.get(HOME)?.tokensToday).toBeNull()
    store.update(idleHere([{ projectKey: 'p_2', tokens: 10 }]), NOW + 500)
    expect(store.current().buildings.get(HOME)?.tokensToday).toBe(0)
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
  afterEach(() => void vi.useRealTimers())

  // Counts what the feed asks of the store; the store itself is real.
  const countingStore = () => {
    const store = createCitySignalStore()
    const counted = { ...store, updates: 0 }
    counted.update = (frame, nowMs) => {
      counted.updates += 1
      store.update(frame, nowMs)
    }
    return counted
  }

  it('a new frame reaches the store, and a re-render with the same frame bumps nothing', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const store = createCitySignalStore()
    const asking = makeFrame({ sessions: [live('claude:a', { attention: 'permission' })] })
    const { rerender } = renderHook(({ frame }) => useCitySignalFeed(frame, store), {
      initialProps: { frame: asking }
    })
    expect(store.current().buildings.get(HOME)?.needsYou).toBe(true)
    const version = store.version()
    rerender({ frame: asking })
    expect(store.version()).toBe(version)
  })

  it('an idle frame does not recompute the signals each second', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const store = countingStore()
    const idle = makeFrame({ sessions: [live('claude:a')] })
    const { rerender } = renderHook(() => useCitySignalFeed(idle, store))
    for (let second = 1; second <= 5; second++) {
      act(() => void vi.advanceTimersByTime(1_000))
      rerender()
    }
    expect(store.updates).toBe(1)
  })

  it('a building turns stale on time with no new frame', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const store = createCitySignalStore()
    renderHook(() => useCitySignalFeed(makeFrame({ sessions: [live('claude:a')] }), store))
    expect(store.current().buildings.get(HOME)?.hasEvidence).toBe(true)
    act(() => void vi.advanceTimersByTime(FRESH.staleAfterMs))
    expect(store.current().buildings.get(HOME)?.hasEvidence).toBe(false)
  })

  it("at local midnight today's spend starts over with no new frame", () => {
    const beforeMidnight = new Date(2026, 9, 17, 23, 59, 30).getTime()
    vi.useFakeTimers()
    vi.setSystemTime(beforeMidnight)
    const store = createCitySignalStore()
    const lasting = { ...FRESH, observedAtMs: beforeMidnight, staleAfterMs: 3_600_000 }
    const session = live('claude:a', {
      observation: lasting,
      startedAtMs: beforeMidnight - 60_000,
      usage: usage(1_500_000)
    })
    renderHook(() => useCitySignalFeed(makeFrame({ sessions: [session] }), store))
    expect(store.current().buildings.get(HOME)?.spireStage).toBe(1)
    act(() => void vi.advanceTimersByTime(30_000))
    expect(store.current().buildings.get(HOME)?.spireStage).toBe(0)
  })
})
