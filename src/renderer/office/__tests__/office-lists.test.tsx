// perf-2: the HUD lists follow the sessions and the agents' structure, not their positions.
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildFixtureFrame } from '../fixture/fixture-feed'
import type { OfficeFrame } from '../scene-model'
import { useOfficeLists } from '../use-office-model'

// `activity` is left out: it reads the clock, so it may change between two frames (perf-2).
const POSITION_ONLY_LISTS = [
  'towerFloors',
  'companies',
  'agentFacts',
  'stacks',
  'companyList'
] as const

function walkedOneStep(frame: OfficeFrame): OfficeFrame {
  return { ...frame, agents: frame.agents.map((agent) => ({ ...agent, x: agent.x + 0.25 })) }
}

// Every session observed now by a healthy source, so the HUD's activity starts fresh.
function observedFrame(nowMs: number): OfficeFrame {
  const frame = buildFixtureFrame(3, nowMs)
  return {
    ...frame,
    feedReceivedAtMs: nowMs,
    sources: [{ id: 'test-source', ok: true, detail: 'healthy' }],
    sessions: frame.sessions.map((session) => ({
      ...session,
      observation: {
        sourceId: 'test-source',
        observedAtMs: nowMs,
        staleAfterMs: 60_000,
        coverage: 'own'
      },
      subagents: session.subagents.map((member) => ({
        ...member,
        attention: 'none' as const,
        observation: {
          sourceId: 'test-source',
          observedAtMs: nowMs,
          staleAfterMs: 60_000,
          coverage: 'own'
        }
      }))
    }))
  }
}

describe('useOfficeLists across frames', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.UTC(2026, 9, 16, 12))
  })
  afterEach(() => vi.useRealTimers())

  it('keeps every position-independent list when only agent positions change', () => {
    const first = buildFixtureFrame(3, Date.now())
    expect(first.agents.length).toBeGreaterThan(0)
    const { result, rerender } = renderHook(
      ({ frame }: { frame: OfficeFrame }) => useOfficeLists(frame, null, null),
      { initialProps: { frame: first } }
    )
    const before = result.current
    rerender({ frame: walkedOneStep(first) })
    const rebuilt = POSITION_ONLY_LISTS.filter((name) => result.current[name] !== before[name])
    expect(rebuilt).toEqual([])
  })

  it('activity still turns stale with no new frame', () => {
    const frame = observedFrame(Date.now())
    const { result } = renderHook(() => useOfficeLists(frame, null, null))
    expect(result.current.activity.office.isAvailable).toBe(true)
    act(() => vi.advanceTimersByTime(70_000))
    expect(result.current.activity.office.isAvailable).toBe(false)
  })

  it('wakes for activity only when evidence can turn stale', () => {
    const frame = observedFrame(Date.now())
    const { result } = renderHook(() => useOfficeLists(frame, null, null))
    const first = result.current
    act(() => vi.advanceTimersByTime(30_000))
    expect(result.current).toBe(first)
  })
})
