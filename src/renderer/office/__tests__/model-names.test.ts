import { describe, expect, it } from 'vitest'
import { friendlyModelName, runsOnChips } from '../logic/model-names'
import { makeSession } from './fixtures'

describe('friendlyModelName', () => {
  it.each([
    ['claude-opus-4-1-20250805', 'Opus 4.1'],
    ['claude-sonnet-4-5-20250929', 'Sonnet 4.5'],
    ['claude-haiku-4-5', 'Haiku 4.5'],
    ['claude-opus-4-20250514', 'Opus 4'],
    ['claude-3-5-sonnet-20241022', 'Sonnet 3.5']
  ])('names the Claude model %s as %s', (modelId, name) => {
    expect(friendlyModelName('claude', { providerId: 'anthropic', modelId })).toBe(name)
  })

  it('keeps an unrecognised Claude id as given', () => {
    expect(friendlyModelName('claude', { providerId: 'anthropic', modelId: 'mystery' })).toBe(
      'mystery'
    )
  })

  it('shows OpenCode ids as given and Codex as Codex', () => {
    const model = { providerId: 'openrouter', modelId: 'qwen/qwen3-coder' }
    expect(friendlyModelName('opencode', model)).toBe('qwen/qwen3-coder')
    expect(friendlyModelName('codex', undefined)).toBe('Codex')
  })

  it('has no name for a session without a model', () => {
    expect(friendlyModelName('claude', undefined)).toBeNull()
    expect(friendlyModelName('opencode', undefined)).toBeNull()
  })
})

describe('runsOnChips', () => {
  const opus = { providerId: 'anthropic', modelId: 'claude-opus-4-1-20250805' }
  it('counts live sessions per model, most used first, skipping unknown models', () => {
    const chips = runsOnChips([
      makeSession({ key: 'a', provider: 'claude', selectedModel: opus }),
      makeSession({ key: 'b', provider: 'claude', selectedModel: opus }),
      makeSession({ key: 'c', provider: 'codex' }),
      makeSession({ key: 'd', provider: 'claude' })
    ])
    expect(chips).toEqual([
      { label: 'Opus 4.1', count: 2 },
      { label: 'Codex', count: 1 }
    ])
  })

  it('is empty when no model is known', () => {
    expect(runsOnChips([makeSession({ key: 'a', provider: 'claude' })])).toEqual([])
  })
})
