import { afterEach, expect, it, vi } from 'vitest'
import { createLiveFeed, type FeedSource } from '../../../office-live/live-feed'
import type { FeedMessage } from '../../../../shared/office/types'
import type { OfficeFrame } from '../../scene-model'

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

it('ignores stale patches without advancing receipt or replacing geometry', () => {
  vi.useFakeTimers()
  vi.setSystemTime(1000)
  let receive: (message: FeedMessage) => void = () => {
    throw new Error('not subscribed')
  }
  const source: FeedSource = {
    ready: async () => undefined,
    onFeedMessage: (listener) => {
      receive = listener
      return () => undefined
    },
    focus: vi.fn(),
    send: vi.fn(),
    respond: vi.fn(),
    peek: vi.fn(),
    start: vi.fn()
  }
  const frames: OfficeFrame[] = []
  const stop = createLiveFeed(source, { storage: null }).subscribe((frame) => frames.push(frame))
  receive({
    type: 'hello',
    v: 1,
    snapshot: { rev: 7, generatedAtMs: 0, sessions: [], sources: [] }
  })
  vi.advanceTimersByTime(100)
  const first = frames.at(-1)
  receive({ type: 'patch', v: 1, seq: 7, upserts: [], removed: [] })
  vi.advanceTimersByTime(100)
  expect(frames.at(-1)?.feedReceivedAtMs).toBe(1000)
  expect(frames.at(-1)?.floors).toBe(first?.floors)
  receive({ type: 'resync' })
  vi.advanceTimersByTime(100)
  expect(frames.at(-1)?.floors).toBe(first?.floors)
  expect(frames.at(-1)?.connected).toBe(false)
  stop()
})

it('handles a rejected ready promise as disconnected', async () => {
  vi.useFakeTimers()
  const frames: OfficeFrame[] = []
  const source: FeedSource = {
    ready: async () => {
      throw new Error('unavailable')
    },
    onFeedMessage: () => () => undefined,
    focus: vi.fn(),
    send: vi.fn(),
    respond: vi.fn(),
    peek: vi.fn(),
    start: vi.fn()
  }
  const stop = createLiveFeed(source, { storage: null }).subscribe((frame) => frames.push(frame))
  await Promise.resolve()
  vi.advanceTimersByTime(100)
  expect(frames.at(-1)?.connected).toBe(false)
  expect(frames.at(-1)?.feedReceivedAtMs).toBeUndefined()
  stop()
})
