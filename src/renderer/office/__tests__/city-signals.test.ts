import { describe, expect, it } from 'vitest'
import { dayKey } from '../../../shared/day-key'
import type {
  AgentObservation,
  SessionRef,
  SessionUsage,
  SubagentRef
} from '../../../shared/office/types'
import {
  type BuildingSignal,
  buildingIdOf,
  citySignals,
  type CompanyCounts,
  createDayLedger,
  type DayLedger,
  type LeaderRow,
  type Leaders,
  observeDay
} from '../logic/city-signals'
import type { OfficeFrame } from '../scene-model'
import { makeFloor, makeFrame, makeSession, makeZone } from './fixtures'

const NOW = new Date(2026, 9, 17, 12).getTime()
const HOME = buildingIdOf('c_test', 'p_1')
const AWAY = buildingIdOf('c_test', 'p_2')

const seen = (ageMs: number): AgentObservation => ({
  sourceId: 'claude',
  observedAtMs: NOW - ageMs,
  staleAfterMs: 60_000,
  coverage: 'own'
})
const FRESH = seen(1_000)
const STALE = seen(120_000)
const counts = (input: number) => ({ input, output: 0, cacheWrite: 0, cacheRead: 0 })
const usage = (tokens: number): SessionUsage => ({
  own: counts(tokens),
  subagents: counts(0),
  spawned: 0,
  contextTokens: null,
  contextLimit: null
})
const live = (key: string, overrides: Partial<SessionRef> = {}): SessionRef =>
  makeSession({ key, observation: FRESH, usage: null, ...overrides })
const member = (id: string, overrides: Partial<SubagentRef> = {}): SubagentRef => ({
  id,
  type: 'general-purpose',
  activity: 'idle',
  attention: 'none',
  observation: FRESH,
  ...overrides
})
const ledgerFor = (sessions: readonly SessionRef[], day?: DayLedger, atMs = NOW): DayLedger =>
  observeDay(day ?? createDayLedger(dayKey(atMs)), sessions, atMs)
const signalsOf = (frame: OfficeFrame, day = ledgerFor(frame.sessions), atMs = NOW) =>
  citySignals(frame, day, atMs)

// A building the saved city keeps, with no session in it.
const homeFloor = makeFloor({
  floorId: 'home',
  buildingId: HOME,
  zones: [
    makeZone({
      id: 'company',
      kind: 'company',
      companyKey: 'c_test',
      children: [
        makeZone({ id: 'project', kind: 'project', companyKey: 'c_test', projectKey: 'p_1' })
      ]
    })
  ]
})

describe('citySignals', () => {
  it('a building never lowers when one of its sessions ends', () => {
    const both = [live('claude:a', { usage: usage(3e6) }), live('claude:b', { usage: usage(2e6) })]
    const morning = ledgerFor(both)
    expect(signalsOf(makeFrame({ sessions: both }), morning).buildings.get(HOME)).toMatchObject({
      tokensToday: 5e6,
      spireStage: 3
    })
    const one = [both[0]]
    const later = ledgerFor(one, morning)
    expect(
      signalsOf(makeFrame({ sessions: one, floors: [homeFloor] }), later).buildings.get(HOME)
    ).toMatchObject({ tokensToday: 5e6, spireStage: 3 })
    // Evidence going stale lowers nothing either (Review Focus 5).
    const quiet = [{ ...both[0], observation: STALE }]
    expect(
      signalsOf(makeFrame({ sessions: quiet }), ledgerFor(quiet, later)).buildings.get(HOME)
    ).toMatchObject({ tokensToday: 5e6, spireStage: 3, hasEvidence: false })
    // With the ledger's day totals, an ended session's tokens stay counted.
    const counted = makeFrame({
      floors: [homeFloor],
      projectsToday: [{ projectKey: 'p_1', tokens: 2e6 }]
    })
    expect(signalsOf(counted).buildings.get(HOME)).toMatchObject({
      tokensToday: 2e6,
      spireStage: 2
    })
  })

  it('a session with stale observation sets no state', () => {
    const asking = { attention: 'permission' as const, activity: 'thinking' as const }
    const stale = signalsOf(
      makeFrame({ sessions: [live('claude:a', { ...asking, observation: STALE })] })
    )
    expect(stale.buildings.get(HOME)).toMatchObject({
      needsYou: false,
      hasEvidence: false,
      busiestCategory: null
    })
    expect(stale.companies.get('c_test')).toMatchObject({ working: 0, waiting: 0, errors: 0 })
    const unstamped = live('claude:a', { ...asking, observation: undefined })
    const mixed = signalsOf(makeFrame({ sessions: [unstamped, live('claude:b')] }))
    expect(mixed.buildings.get(HOME)?.needsYou).toBe(false)
    const fresh = signalsOf(makeFrame({ sessions: [live('claude:a', asking)] }))
    expect(fresh.buildings.get(HOME)).toMatchObject({ needsYou: true, hasEvidence: true })
    expect(fresh.companies.get('c_test')).toMatchObject({ waiting: 1 })
  })

  it('a building’s marks come from each fresh agent, members included', () => {
    const sessions = [
      live('claude:a', {
        activity: 'editing',
        currentTool: { name: 'Edit', category: 'edit' },
        subagents: [
          member('m1', { activity: 'running', currentTool: { name: 'Bash', category: 'run' } }),
          member('m2', { activity: 'running', currentTool: { name: 'Bash', category: 'run' } }),
          member('m3', { attention: 'error', observation: STALE })
        ]
      }),
      live('claude:b', { attention: 'done' }),
      live('claude:c', { projectKey: 'p_2', attention: 'limited' }),
      live('claude:d', { projectKey: 'p_2', attention: 'error' })
    ]
    const signals = signalsOf(makeFrame({ sessions }))
    const home: BuildingSignal = {
      tokensToday: null,
      spireStage: 0,
      busiestCategory: 'run',
      isDone: true,
      hasError: false,
      isLimited: false,
      needsYou: false,
      hasEvidence: true
    }
    expect(signals.buildings.get(HOME)).toEqual(home)
    expect(signals.buildings.get(AWAY)).toMatchObject({ hasError: true, isLimited: true })
    const company: CompanyCounts = { working: 3, waiting: 0, errors: 2, tokensToday: null }
    expect(signals.companies.get('c_test')).toEqual(company)
  })

  it('null usage is unknown and raises the building once it lands', () => {
    const uncounted = [live('claude:a')]
    const before = ledgerFor(uncounted)
    const unknown = signalsOf(makeFrame({ sessions: uncounted }), before)
    expect(unknown.buildings.get(HOME)).toMatchObject({ tokensToday: null, spireStage: 0 })
    expect(unknown.companies.get('c_test')?.tokensToday).toBeNull()
    expect(unknown.leaders.topSpender).toBeNull()
    const landed = [live('claude:a', { usage: usage(2e6) })]
    const after = signalsOf(makeFrame({ sessions: landed }), ledgerFor(landed, before))
    expect(after.buildings.get(HOME)).toMatchObject({ tokensToday: 2e6, spireStage: 2 })
    expect(after.companies.get('c_test')?.tokensToday).toBe(2e6)
  })

  it('leaders: ties break by key; zero tokens never lead', () => {
    const working = { activity: 'editing' as const }
    const sessions = [
      live('claude:e', { usage: usage(5e6), startedAtMs: NOW - 1_000, ...working }),
      live('claude:a', {
        usage: usage(5e6),
        startedAtMs: NOW - 1_000,
        projectKey: 'p_2',
        subagents: [member('m1'), member('m2')],
        ...working
      }),
      live('claude:c', { usage: usage(1e6), startedAtMs: NOW - 9_000, subagents: [member('m1')] }),
      live('claude:d', { usage: usage(0), startedAtMs: NOW - 9_000 }),
      live('claude:f', { usage: usage(9e6), observation: STALE, startedAtMs: NOW - 99_000 })
    ]
    const { leaders } = signalsOf(makeFrame({ sessions }))
    const topSpender: LeaderRow = { key: 'claude:a', value: 5e6 }
    const expected: Leaders = {
      crowned: ['claude:a', 'claude:e', 'claude:c'],
      topSpender,
      busiestProject: { key: [AWAY, HOME].sort()[0], value: 1 },
      longestRunning: { key: 'claude:c', value: 9_000 },
      mostCrew: { key: 'claude:a', value: 2 }
    }
    expect(leaders).toEqual(expected)
    const reversed = signalsOf(makeFrame({ sessions: [...sessions].reverse() })).leaders
    expect(reversed).toEqual(leaders)
    const idle = signalsOf(makeFrame({ sessions: [live('claude:d', { usage: usage(0) })] }))
    expect(idle.leaders).toMatchObject({
      crowned: [],
      topSpender: null,
      busiestProject: null,
      mostCrew: null
    })
  })

  it('signals carry keys and numbers only, never labels', () => {
    const secret = live('claude:a', {
      name: 'secret-session',
      cwd: '/Users/ada/Secret Co/secret-project',
      companyLabel: 'Secret Co',
      projectLabel: 'Secret Project',
      attention: 'question',
      usage: usage(3e6),
      currentTool: { name: 'SecretTool', category: 'web', callId: 'call-secret' }
    })
    const signals = signalsOf(makeFrame({ sessions: [secret] }))
    const text = JSON.stringify({
      buildings: [...signals.buildings],
      leaders: signals.leaders,
      companies: [...signals.companies]
    })
    expect(text).not.toMatch(/secret/i)
    expect(text).toContain(HOME)
  })

  it('the day rollover lowers spires only when the local day key changes', () => {
    const spent = [live('claude:a', { usage: usage(5e6) })]
    const lateEvening = new Date(2026, 9, 17, 23, 59).getTime()
    const evening = ledgerFor(spent, undefined, lateEvening)
    const ended = ledgerFor([], evening, lateEvening + 30_000)
    expect(ended).toBe(evening)
    const city = makeFrame({ floors: [homeFloor] })
    expect(signalsOf(city, ended, lateEvening).buildings.get(HOME)).toMatchObject({
      tokensToday: 5e6,
      spireStage: 3
    })
    const midnight = new Date(2026, 9, 18, 0, 0, 10).getTime()
    const tomorrow = ledgerFor([], ended, midnight)
    expect(tomorrow.dayKey).toBe('2026-10-18')
    expect(signalsOf(city, tomorrow, midnight).buildings.get(HOME)).toMatchObject({
      tokensToday: null,
      spireStage: 0
    })
    // A ledger from yesterday, read today, holds nothing for today.
    expect(signalsOf(city, ended, midnight).buildings.get(HOME)).toMatchObject({
      tokensToday: null,
      spireStage: 0
    })
  })
})

describe('buildingIdOf', () => {
  it('names a building as the saved city does, by company and project', () => {
    expect(buildingIdOf('c 1', 'p/2')).toBe('building:c%201:p%2F2')
  })
})
