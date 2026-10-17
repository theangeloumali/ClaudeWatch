import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { session } from '../../../office/sim/fixtures'
import type { FeedMessage, SessionRef } from '../../../shared/office/types'
import { createOfficeSettingsStore } from '../../office/logic/office-settings'
import type { OfficeFrame } from '../../office/scene-model'
import { createLiveFeed, type FeedSource } from '../live-feed'

const validations = vi.hoisted(() => ({ count: 0 }))
vi.mock('../../../shared/office/world-document', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../shared/office/world-document')>()
  return {
    ...original,
    validateWorldDocument: (...args: Parameters<typeof original.validateWorldDocument>) => {
      validations.count++
      return original.validateWorldDocument(...args)
    }
  }
})

const unsubscribes: (() => void)[] = []

function createEnvironment() {
  const frames: OfficeFrame[] = []
  const bytes = new Map<string, string>()
  let listener: ((message: FeedMessage) => void) | undefined
  const source: FeedSource = {
    ready: vi.fn().mockResolvedValue(undefined),
    onFeedMessage: (next) => {
      listener = next
      return () => (listener = undefined)
    },
    focus: vi.fn(),
    send: vi.fn(),
    respond: vi.fn(),
    peek: vi.fn(),
    start: vi.fn()
  }
  const settings = createOfficeSettingsStore(null)
  settings.set('loungeTrips', false)
  const feed = createLiveFeed(source, {
    storage: { getItem: (key) => bytes.get(key) ?? null, setItem: (key, v) => bytes.set(key, v) },
    settings,
    visibility: { read: () => ({ isHidden: false, isFocused: true }), onChange: () => () => {} }
  })
  unsubscribes.push(feed.subscribe((frame) => frames.push(frame)))
  let seq = 1
  const send = (message: FeedMessage): OfficeFrame => {
    listener?.(message)
    vi.advanceTimersByTime(100)
    const latest = frames.at(-1)
    if (!latest) throw new Error('the feed emitted no frame')
    return latest
  }
  return {
    hello: (sessions: SessionRef[]) =>
      send({
        type: 'hello',
        v: 1,
        snapshot: { rev: seq, generatedAtMs: Date.now(), sessions, sources: [] }
      }),
    patch: (upserts: SessionRef[]) =>
      send({ type: 'patch', v: 1, seq: ++seq, upserts, removed: [] })
  }
}

describe('world validation memo (perf-5)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
  })
  afterEach(() => {
    for (const unsubscribe of unsubscribes.splice(0)) unsubscribe()
    vi.useRealTimers()
  })

  it('a token-only message does not re-run validateWorldDocument', () => {
    const environment = createEnvironment()
    const lead = session('claude:a')
    environment.hello([lead])
    const before = validations.count
    expect(before).toBeGreaterThan(0)
    environment.patch([
      {
        ...lead,
        usage: {
          own: { input: 9, output: 9, cacheRead: 9, cacheWrite: 9 },
          subagents: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          spawned: 0,
          contextTokens: 9,
          contextLimit: null
        }
      }
    ])
    expect(validations.count).toBe(before)
  })
})
