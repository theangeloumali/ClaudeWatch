import { expect, it } from 'vitest'
import { hasValidObservationMetadata, hasValidPeekMetadata } from '../../observation-dto'

const observation = { sourceId: 'source', observedAtMs: 100, staleAfterMs: 500, coverage: 'own' }
const message = (session: unknown, sources: unknown[] = []) => ({
  type: 'hello',
  v: 1,
  snapshot: { rev: 1, generatedAtMs: 0, sessions: [session], sources }
})

it('accepts legacy undefined evidence without manufacturing an observation', () => {
  expect(hasValidObservationMetadata(message({ subagents: [] }))).toBe(true)
  expect(hasValidPeekMetadata({ success: true, lines: ['legacy'] })).toBe(true)
})

it('validates optional observations and member evidence when present', () => {
  expect(
    hasValidObservationMetadata(
      message({
        observation,
        subagents: [
          { observation, attention: 'permission', currentTool: { name: 'Read', category: 'read' } }
        ]
      })
    )
  ).toBe(true)
  for (const invalid of [
    null,
    { ...observation, observedAtMs: NaN },
    { ...observation, staleAfterMs: -1 },
    { ...observation, coverage: 'lead' }
  ]) {
    expect(hasValidObservationMetadata(message({ observation: invalid, subagents: [] }))).toBe(
      false
    )
  }
  expect(hasValidObservationMetadata(message({ subagents: [{ attention: 'invented' }] }))).toBe(
    false
  )
  expect(
    hasValidObservationMetadata(
      message({ subagents: [{ currentTool: { name: 'Read', category: 'invented' } }] })
    )
  ).toBe(false)
  expect(hasValidObservationMetadata(message({ subagents: [] }, [{ checkedAtMs: Infinity }]))).toBe(
    false
  )
})

it('rejects incorrect or partial terminal provenance while allowing old responses', () => {
  const terminal = {
    ownerAgentKey: 'claude:a',
    paneKey: 'tab:leaf',
    pid: 42,
    startedAtMs: 5,
    incarnationId: 'inc-a'
  }
  expect(hasValidPeekMetadata({ capturedAtMs: 100, targetAgentKey: 'claude:a', terminal })).toBe(
    true
  )
  expect(hasValidPeekMetadata({ capturedAtMs: -1 })).toBe(false)
  expect(hasValidPeekMetadata({ targetAgentKey: 42 })).toBe(false)
  expect(hasValidPeekMetadata({ terminal: { ...terminal, pid: null } })).toBe(false)
  expect(hasValidPeekMetadata({ targetAgentKey: 'claude:b', terminal })).toBe(false)
})
