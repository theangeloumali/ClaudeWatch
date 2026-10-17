import { describe, expect, it } from 'vitest'
import type {
  AgentObservation,
  CurrentTool,
  SessionRef,
  ToolCategory
} from '../../../shared/office/types'
import { type BuildingSignal, buildingIdOf } from '../logic/city-signals'
import { createCitySignalStore } from '../logic/city-signal-store'
import { createProjectSigns, SIGN_ICONS, signFor, venueSign } from '../logic/project-signs'
import { makeFrame, makeSession } from './fixtures'

const NOW = new Date(2026, 9, 17, 12).getTime()
const HOME = buildingIdOf('c_test', 'p_1')
const seen = (ageMs: number): AgentObservation => ({
  sourceId: 'claude',
  observedAtMs: NOW - ageMs,
  staleAfterMs: 60_000,
  coverage: 'own'
})
const tool = (category: ToolCategory): CurrentTool => ({ name: category, category })
const live = (key: string, overrides: Partial<SessionRef> = {}): SessionRef =>
  makeSession({ key, observation: seen(1_000), ...overrides })

// The sign a frame's sessions give the home building, through the real signal store.
function signOf(sessions: readonly SessionRef[]) {
  const store = createCitySignalStore()
  store.update(makeFrame({ sessions: [...sessions] }), NOW)
  return createProjectSigns(store).sign(HOME)
}

const quiet: BuildingSignal = {
  tokensToday: null,
  spireStage: 0,
  needsYou: false,
  hasError: false,
  isLimited: false,
  isDone: false,
  busiestCategory: null,
  hasEvidence: true
}

describe('project signs', () => {
  it('a project with a permission prompt shows the hand on its sign', () => {
    const asking = live('claude:a', { attention: 'permission', activity: 'editing' })
    expect(signOf([asking])).toEqual({ icon: 'hand', tint: 'needs-you' })
  })

  it('a working project shows the icon of its busiest fresh tool category', () => {
    const working = [
      live('claude:a', { activity: 'editing', currentTool: tool('edit') }),
      live('claude:b', { activity: 'editing', currentTool: tool('edit') }),
      live('claude:c', { activity: 'reading', currentTool: tool('read') }),
      live('claude:d', {
        activity: 'running',
        currentTool: tool('run'),
        observation: seen(120_000)
      })
    ]
    expect(signOf(working)).toEqual({ icon: 'edit', tint: 'working' })
    expect(signOf([working[2]])).toEqual({ icon: 'read', tint: 'working' })
  })

  it('no fresh evidence shows the grey sign', () => {
    const stale = live('claude:a', {
      activity: 'editing',
      currentTool: tool('edit'),
      attention: 'permission',
      observation: seen(120_000)
    })
    expect(signOf([stale])).toEqual({ icon: 'unknown', tint: 'unknown' })
  })

  it('needs-you beats an error, an error beats work, and idle or done is dark', () => {
    const all = { ...quiet, needsYou: true, hasError: true, busiestCategory: 'run' as const }
    expect(signFor(all)?.tint).toBe('needs-you')
    expect(signFor({ ...all, needsYou: false })).toEqual({ icon: 'error', tint: 'error' })
    expect(signFor({ ...quiet, isLimited: true, busiestCategory: 'web' })?.icon).toBe('error')
    expect(signFor({ ...quiet, busiestCategory: 'agent' })).toEqual({
      icon: 'agent',
      tint: 'working'
    })
    expect(signFor(quiet)).toBeNull()
    expect(signFor({ ...quiet, isDone: true })).toBeNull()
  })

  it('every venue kind has its own icon, and every icon an atlas cell', () => {
    const kinds = ['arcade', 'lounge', 'market', 'garage', 'transit'] as const
    const icons = kinds.map((kind) => venueSign(kind).icon)
    expect(new Set(icons).size).toBe(kinds.length)
    expect(SIGN_ICONS.length).toBeLessThanOrEqual(20)
    expect(icons.every((icon) => SIGN_ICONS.includes(icon))).toBe(true)
  })

  it('bumps its version only when a sign changes, not on every signal tick', () => {
    const store = createCitySignalStore()
    const signs = createProjectSigns(store)
    const editing = live('claude:a', { activity: 'editing', currentTool: tool('edit') })
    store.update(makeFrame({ sessions: [editing] }), NOW)
    const first = signs.version()
    expect(signs.sign(HOME)?.icon).toBe('edit')
    store.update(makeFrame({ sessions: [{ ...editing, updatedAtMs: 5 }] }), NOW + 10)
    expect(signs.sign(HOME)?.icon).toBe('edit')
    expect(signs.version()).toBe(first)
    store.update(makeFrame({ sessions: [{ ...editing, attention: 'question' }] }), NOW + 20)
    expect(signs.sign(HOME)?.tint).toBe('needs-you')
    expect(signs.version()).toBe(first + 1)
  })
})
