import { describe, expect, it } from 'vitest'
import {
  EFFECTIVE_WORLD_SESSION_FIELDS,
  effectiveWorldKey,
  resolveEffectiveWorld
} from '../effective-world'
import { session, subagent } from '../fixtures'
import { buildLayout } from '../layout'
import { createWorldDocument } from '../../../shared/office/world-document'
import type { SessionRef } from '../../../shared/office/types'

const crew = (): SessionRef[] => [
  session('claude:a'),
  { ...session('claude:b', 'p_b'), subagents: [subagent('x')] }
]

// Every field read through `session`, nested reads joined by dots (array items as `[]`).
function sessionReads(sessions: readonly SessionRef[]): Set<string> {
  const reads = new Set<string>()
  const watch = <T extends object>(value: T, path: string): T =>
    new Proxy(value, {
      get(target, key, receiver) {
        const result: unknown = Reflect.get(target, key, receiver)
        if (typeof key !== 'string') return result
        const isItem = Array.isArray(target) && /^\d+$/.test(key)
        const childPath = isItem ? `${path}[]` : `${path}.${key}`
        if (!isItem && typeof result !== 'function') reads.add(childPath)
        return typeof result === 'object' && result !== null ? watch(result, childPath) : result
      }
    })
  const base = buildLayout([...sessions], undefined)
  resolveEffectiveWorld(
    base,
    createWorldDocument(base, sessions),
    sessions.map((item) => watch(item, 'session'))
  )
  return reads
}

describe('effectiveWorldKey (perf-5)', () => {
  const sessions = crew()
  const base = buildLayout(sessions, undefined)
  const document = createWorldDocument(base, sessions)
  const keyWith = (change: (item: SessionRef) => SessionRef): string =>
    effectiveWorldKey(
      base,
      document,
      sessions.map((item, index) => (index === 0 ? change(item) : item))
    )
  const reference = effectiveWorldKey(base, document, sessions)

  it('ignores what resolveEffectiveWorld never reads: tokens, activity, observation', () => {
    expect(
      keyWith((item) => ({
        ...item,
        activity: 'idle',
        updatedAtMs: 99,
        observation: { observedAtMs: 99 } as SessionRef['observation'],
        usage: {
          own: { input: 9, output: 9, cacheRead: 9, cacheWrite: 9 },
          subagents: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          spawned: 0,
          contextTokens: 9,
          contextLimit: null
        }
      }))
    ).toBe(reference)
  })

  it.each<[string, (item: SessionRef) => SessionRef]>([
    ['name', (item) => ({ ...item, name: 'renamed' })],
    ['companyLabel', (item) => ({ ...item, companyLabel: 'Other' })],
    ['projectLabel', (item) => ({ ...item, projectLabel: 'Other' })],
    ['subagent count', (item) => ({ ...item, subagents: [subagent('g1')] })]
  ])('changes with %s even while the geometry is the same', (_field, change) => {
    expect(keyWith(change)).not.toBe(reference)
  })

  it('changes with the document revision', () => {
    expect(effectiveWorldKey(base, { ...document, revision: 1 }, sessions)).not.toBe(reference)
  })

  it('covers every session field resolveEffectiveWorld reads', () => {
    const fields: readonly string[] = EFFECTIVE_WORLD_SESSION_FIELDS
    for (const path of sessionReads(crew()))
      expect(fields, `${path} is read but not keyed`).toContain(path.split('.')[1])
  })
})
