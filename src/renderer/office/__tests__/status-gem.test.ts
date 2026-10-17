import { describe, expect, it } from 'vitest'
import { gemFor, GEM_SPECS } from '../logic/status-gem'

describe('gemFor', () => {
  it('maps each attention to its own state', () => {
    expect(gemFor({ attention: 'permission', activity: 'idle' })?.kind).toBe('permission')
    expect(gemFor({ attention: 'question', activity: 'running' })?.kind).toBe('question')
    expect(gemFor({ attention: 'done', activity: 'idle' })?.kind).toBe('done')
    expect(gemFor({ attention: 'error', activity: 'idle' })?.kind).toBe('error')
    expect(gemFor({ attention: 'limited', activity: 'idle' })?.kind).toBe('limited')
  })

  it('reads as working while busy and as nothing while idle', () => {
    expect(gemFor({ attention: 'none', activity: 'editing' })?.kind).toBe('working')
    expect(gemFor({ attention: 'none', activity: 'idle' })).toBeNull()
  })

  it('names every state in words so colour is never the only cue', () => {
    const labels = Object.values(GEM_SPECS).map((spec) => spec.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  // The bridge sets 'limited' only from rate-limit evidence, so the words say which limit.
  it('names a rate-limited session as rate limited', () => {
    expect(GEM_SPECS.limited.label).toBe('Rate limited')
  })
})
