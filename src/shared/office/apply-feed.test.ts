import { describe, it, expect } from 'vitest'
import { applyFeed } from './apply-feed'
import type { OfficeSnapshot, SessionRef } from './types'

const session = (key: string, overrides: Partial<SessionRef> = {}): SessionRef => ({
  key,
  provider: 'claude',
  sessionId: key.split(':')[1] ?? key,
  pid: 100,
  name: 'app',
  cwd: '/repo/app',
  projectKey: 'p_1',
  projectLabel: 'app',
  projectRoot: '/repo/app',
  companyKey: 'c_test',
  companyLabel: 'Test Co',
  worktree: null,
  host: 'terminal',
  orcaPaneKey: null,
  activity: 'idle',
  attention: 'none',
  currentTool: null,
  subagents: [],
  startedAtMs: 1,
  updatedAtMs: 1,
  ...overrides
})

const snapshot = (sessions: SessionRef[], rev = 1): OfficeSnapshot => ({
  rev,
  generatedAtMs: 10,
  sessions,
  sources: []
})

describe('applyFeed', () => {
  it('replaces state with the hello snapshot', () => {
    const hello = snapshot([session('claude:a')])
    expect(applyFeed(null, { type: 'hello', v: 1, snapshot: hello })).toEqual(hello)
  })

  it('upserts and removes sessions from a patch', () => {
    const start = snapshot([session('claude:a'), session('claude:b')])
    const next = applyFeed(start, {
      type: 'patch',
      v: 1,
      seq: 2,
      upserts: [session('claude:a', { activity: 'editing' }), session('claude:c')],
      removed: ['claude:b']
    })
    expect(next?.sessions.map((s) => [s.key, s.activity])).toEqual([
      ['claude:a', 'editing'],
      ['claude:c', 'idle']
    ])
    expect(next?.rev).toBe(2)
  })

  it('folds changed source health from a patch that changes no session', () => {
    const start = snapshot([session('claude:a')])
    const sources = [{ id: 'orca', ok: false, detail: 'unavailable' }]
    const next = applyFeed(start, {
      type: 'patch',
      v: 1,
      seq: 3,
      upserts: [],
      removed: [],
      sources
    })
    expect(next?.sources).toEqual(sources)
    expect(next?.sessions).toBe(start.sessions)
  })

  it('keeps the same sessions array for an empty patch so memoised consumers skip work', () => {
    const start = snapshot([session('claude:a')])
    const next = applyFeed(start, { type: 'patch', v: 1, seq: 5, upserts: [], removed: [] })
    expect(next?.sessions).toBe(start.sessions)
    expect(next?.rev).toBe(5)
  })

  it('ignores a duplicate or late patch, as the sim does', () => {
    const start = snapshot([session('claude:a')], 4)
    for (const seq of [4, 3]) {
      expect(
        applyFeed(start, { type: 'patch', v: 1, seq, upserts: [], removed: ['claude:a'] })
      ).toBe(start)
    }
  })

  it('ignores a patch that arrives before any hello', () => {
    expect(
      applyFeed(null, { type: 'patch', v: 1, seq: 1, upserts: [session('claude:a')], removed: [] })
    ).toBeNull()
  })

  it('clears state on resync so the next hello rebuilds it', () => {
    expect(applyFeed(snapshot([session('claude:a')]), { type: 'resync' })).toBeNull()
  })

  it('keeps the latest totals for today: a patch carrying them replaces them, one without keeps them', () => {
    const today = [{ projectKey: 'p_1', tokens: 10 }]
    const start = { ...snapshot([session('claude:a')]), projectsToday: today }
    const quiet = applyFeed(start, { type: 'patch', v: 1, seq: 2, upserts: [], removed: [] })
    expect(quiet?.projectsToday).toBe(today)
    const later = [{ projectKey: 'p_1', tokens: 30 }]
    const counted = applyFeed(quiet, {
      type: 'patch',
      v: 1,
      seq: 3,
      upserts: [session('claude:a', { activity: 'editing' })],
      removed: [],
      projectsToday: later
    })
    expect(counted?.projectsToday).toBe(later)
    const onlyTotals = applyFeed(counted, {
      type: 'patch',
      v: 1,
      seq: 4,
      upserts: [],
      removed: [],
      projectsToday: []
    })
    expect(onlyTotals).toMatchObject({ rev: 4, projectsToday: [] })
  })
})
