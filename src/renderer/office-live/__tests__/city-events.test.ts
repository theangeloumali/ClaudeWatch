import { describe, expect, it } from 'vitest'
import type { AgentObservation, SessionRef, SessionUsage } from '../../../shared/office/types'
import { makeSession } from '../../office/__tests__/fixtures'
import { buildingIdOf } from '../../office/logic/city-signals'
import { CITY_EVENT_LIFE_MS, type CityEvent, cityEvents, createCityEventLog } from '../city-events'

const T0 = new Date(2026, 9, 17, 12).getTime()
const MINUTE = 60_000
const HOME = buildingIdOf('c_test', 'p_1')

const seenAt = (atMs: number): AgentObservation => ({
  sourceId: 'claude',
  observedAtMs: atMs,
  staleAfterMs: MINUTE,
  coverage: 'own'
})
const usage = (tokens: number): SessionUsage => ({
  own: { input: tokens, output: 0, cacheWrite: 0, cacheRead: 0 },
  subagents: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
  spawned: 0,
  contextTokens: null,
  contextLimit: null
})
// A session as the bridge reports it at `atMs`, freshly read unless told otherwise.
const at = (atMs: number, overrides: Partial<SessionRef> = {}): SessionRef =>
  makeSession({ key: 'claude:a', observation: seenAt(atMs), updatedAtMs: atMs, ...overrides })

describe('cityEvents', () => {
  it('a hello or resync re-seeds and fires nothing', () => {
    const log = createCityEventLog()
    log.observe('hello', [at(T0, { attention: 'none', usage: usage(9e5) })], T0)
    log.observe('hello', [at(T0 + 1, { attention: 'done', usage: usage(3e6) })], T0 + 1)
    log.observe('resync', [], T0 + 2)
    log.observe('hello', [at(T0 + 3, { attention: 'done', usage: usage(6e6) })], T0 + 3)
    expect(log.active(T0 + 3)).toEqual([])
    expect(log.version()).toBe(0)
  })

  it('first sight of a session seeds and fires nothing', () => {
    const log = createCityEventLog()
    log.observe('hello', [], T0)
    const first = at(T0 + 1, {
      attention: 'done',
      usage: usage(4e6),
      currentTool: { name: 'Bash', category: 'run', callId: 'call-1' }
    })
    log.observe('patch', [first], T0 + 1)
    expect(log.active(T0 + 1)).toEqual([])
  })

  it('a milestone crossing between two patches fires once', () => {
    const log = createCityEventLog()
    log.observe('hello', [at(T0, { usage: usage(9e5) })], T0)
    log.observe('patch', [at(T0 + 1_000, { usage: usage(2.5e6) })], T0 + 1_000)
    log.observe('patch', [at(T0 + 2_000, { usage: usage(2.6e6) })], T0 + 2_000)
    const milestones = log.active(T0 + 2_000).filter((event) => event.kind === 'milestone')
    const crossing: CityEvent = {
      id: 'claude:a:milestone:2',
      kind: 'milestone',
      buildingId: HOME,
      sessionKey: 'claude:a',
      atMs: T0 + 1_000
    }
    expect(milestones).toEqual([crossing])
    expect(log.version()).toBe(2)
  })

  it('a token count going from null to a value fires no milestone', () => {
    const log = createCityEventLog()
    log.observe('hello', [at(T0, { usage: null })], T0)
    log.observe('patch', [at(T0 + 1, { usage: usage(4e7) })], T0 + 1)
    expect(log.active(T0 + 1)).toEqual([])
  })

  it('a stale patch fires nothing', () => {
    const log = createCityEventLog()
    log.observe('hello', [at(T0, { usage: usage(9e5) })], T0)
    const stale = { observation: seenAt(T0 - 2 * MINUTE) }
    log.observe('patch', [at(T0 + 1, { ...stale, usage: usage(3e6), attention: 'done' })], T0 + 1)
    log.observe('patch', [at(T0 + 2, { usage: usage(3e6), attention: 'done' })], T0 + 2)
    expect(log.active(T0 + 2)).toEqual([])
  })

  it('fired ids are deduped and pruned after 10 minutes', () => {
    const log = createCityEventLog()
    const cross = (atMs: number): void => {
      log.observe('hello', [at(atMs, { usage: usage(9e5) })], atMs)
      log.observe('patch', [at(atMs + 1, { usage: usage(1.5e6) })], atMs + 1)
    }
    cross(T0)
    const fired = log.version()
    cross(T0 + MINUTE)
    expect(log.version()).toBe(fired)
    cross(T0 + 10 * MINUTE + 2)
    expect(log.version()).toBe(fired + 1)
    expect(log.active(T0 + 10 * MINUTE + 3).map((event) => event.id)).toEqual([
      'claude:a:milestone:1'
    ])
  })

  it('an account-change hello after a milestone does not fire it again', () => {
    const log = createCityEventLog()
    log.observe('hello', [at(T0, { usage: usage(9e5) })], T0)
    log.observe('patch', [at(T0 + 1, { usage: usage(1.2e6) })], T0 + 1)
    const fired = log.version()
    log.observe('hello', [at(T0 + 2, { usage: usage(1.2e6) })], T0 + 2)
    log.observe('patch', [at(T0 + 3, { usage: usage(1.3e6) })], T0 + 3)
    expect(log.version()).toBe(fired)
    expect(log.active(T0 + 3).map((event) => [event.kind, event.atMs])).toEqual([
      ['milestone', T0 + 1],
      ['hoist', T0 + 1]
    ])
  })

  it('a patch crossing 1M and 2M fires one milestone, for 2M', () => {
    const log = createCityEventLog()
    log.observe('hello', [at(T0, { usage: usage(5e5) })], T0)
    log.observe('patch', [at(T0 + 1, { usage: usage(2.2e6) })], T0 + 1)
    expect(
      log
        .active(T0 + 1)
        .filter((event) => event.kind === 'milestone')
        .map((event) => event.id)
    ).toEqual(['claude:a:milestone:2'])
  })

  it('a new tool call id dispatches once, with its category', () => {
    const log = createCityEventLog()
    const tool = (callId: string) => ({ name: 'Bash', category: 'run' as const, callId })
    log.observe('hello', [at(T0, { currentTool: tool('call-1') })], T0)
    log.observe('patch', [at(T0 + 1, { currentTool: tool('call-1') })], T0 + 1)
    log.observe('patch', [at(T0 + 2, { currentTool: tool('call-2') })], T0 + 2)
    log.observe('patch', [at(T0 + 3, { currentTool: null })], T0 + 3)
    expect(log.active(T0 + 3)).toEqual([
      {
        id: 'claude:a:dispatch:call-2',
        kind: 'dispatch',
        buildingId: HOME,
        sessionKey: 'claude:a',
        category: 'run',
        atMs: T0 + 2
      }
    ])
  })

  it('a turn ending raises done once', () => {
    const log = createCityEventLog()
    log.observe('hello', [at(T0, { attention: 'none' })], T0)
    log.observe('patch', [at(T0 + 1, { attention: 'done' })], T0 + 1)
    log.observe('patch', [at(T0 + 2, { attention: 'done' })], T0 + 2)
    expect(log.active(T0 + 2).map((event) => event.id)).toEqual([`claude:a:done:${T0 + 1}`])
  })

  it('a spire stage crossing hoists, but a gain under 0.5% of the day raises none', () => {
    const log = createCityEventLog()
    const day = (tokens: number) => [{ projectKey: 'p_1', tokens }]
    log.observe('hello', [at(T0)], T0, day(1.9e6))
    log.observe('patch', [at(T0 + 1)], T0 + 1, day(2.1e6))
    log.observe('patch', [at(T0 + 2)], T0 + 2, day(4_999_990))
    log.observe('patch', [at(T0 + 3)], T0 + 3, day(5_000_001))
    expect(log.active(T0 + 3)).toEqual([
      {
        id: `${HOME}:hoist:2:2026-10-17`,
        kind: 'hoist',
        buildingId: HOME,
        sessionKey: 'claude:a',
        atMs: T0 + 1
      }
    ])
  })

  it('a live event is dropped once the render clock passes its end', () => {
    const log = createCityEventLog()
    log.observe('hello', [at(T0, { attention: 'none' })], T0)
    log.observe('patch', [at(T0 + 1, { attention: 'done' })], T0 + 1)
    expect(log.active(T0 + CITY_EVENT_LIFE_MS.done)).toHaveLength(1)
    expect(log.active(T0 + 1 + CITY_EVENT_LIFE_MS.done)).toEqual([])
  })

  it('the page has one shared log', () => {
    expect(cityEvents.active(T0)).toEqual([])
  })
})
