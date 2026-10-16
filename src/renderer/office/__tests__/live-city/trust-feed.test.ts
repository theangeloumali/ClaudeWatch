import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeedMessage, SessionRef } from '../../../../shared/office/types'
import { createLiveFeed, type FeedSource } from '../../../office-live/live-feed'
import type { OfficeFrame } from '../../scene-model'

const session: SessionRef = {
  key: 'opencode:trust-example',
  provider: 'opencode',
  sessionId: 'trust-example',
  pid: 42,
  name: 'Trust example',
  cwd: '/project',
  projectKey: 'project',
  projectLabel: 'Project',
  projectRoot: '/project',
  companyKey: 'company',
  companyLabel: 'Company',
  worktree: null,
  host: 'orca',
  orcaPaneKey: 'pane-example',
  activity: 'editing',
  attention: 'none',
  currentTool: { name: 'Edit', category: 'edit' },
  subagents: [],
  startedAtMs: 1,
  updatedAtMs: 4000
}

function createHarness(options: { worldEditing?: boolean } = {}) {
  const listeners = new Set<(message: FeedMessage) => void>()
  const source: FeedSource = {
    ready: vi.fn().mockResolvedValue(undefined),
    onFeedMessage: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    focus: vi.fn().mockResolvedValue({ success: true, target: 'pane' }),
    send: vi.fn().mockResolvedValue({ success: true }),
    respond: vi.fn().mockResolvedValue({ success: true }),
    peek: vi.fn().mockResolvedValue({ success: true, lines: ['fixture only'] }),
    start: vi.fn().mockResolvedValue({ success: true })
  }
  const frames: OfficeFrame[] = []
  const feed = createLiveFeed(source, { storage: null, ...options })
  const unsubscribe = feed.subscribe((frame) => frames.push(frame))
  return {
    source,
    feed,
    frames,
    unsubscribe,
    emit: (message: FeedMessage) => {
      for (const listener of listeners) listener(message)
    },
    hello: () => {
      for (const listener of listeners)
        listener({
          type: 'hello',
          v: 1,
          snapshot: { rev: 7, generatedAtMs: 5000, sessions: [session], sources: [] }
        })
    }
  }
}

describe('live work evidence boundaries', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(10000)
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('records feed receipt and revision without relabeling old activity as newly observed', () => {
    const harness = createHarness()
    harness.hello()
    vi.advanceTimersByTime(100)
    expect(harness.frames.at(-1)).toMatchObject({ feedReceivedAtMs: 10000, feedRevision: 7 })
    expect(harness.frames.at(-1)?.sessions[0].updatedAtMs).toBe(4000)
    expect(harness.frames.at(-1)?.sessions[0]).not.toHaveProperty('observation')
    harness.unsubscribe()
  })

  it('does not let animation ticks advance the feed receipt timestamp', () => {
    const harness = createHarness()
    harness.hello()
    vi.advanceTimersByTime(100)
    const originalReceipt = 10000
    vi.advanceTimersByTime(5000)
    expect(harness.frames.at(-1)).toMatchObject({ feedReceivedAtMs: originalReceipt })
    harness.unsubscribe()
  })

  it('keeps last known sessions but reports a resync as disconnected', () => {
    const harness = createHarness()
    harness.hello()
    vi.advanceTimersByTime(100)
    harness.emit({ type: 'resync' })
    // jsdom's page is out of focus, so the frame waits for the blurred frame gap.
    vi.advanceTimersByTime(200)
    expect(harness.frames.at(-1)).toMatchObject({ connected: false })
    expect(harness.frames.at(-1)?.sessions.map((record) => record.key)).toEqual([session.key])
    harness.unsubscribe()
  })

  it('never captures or invokes provider actions while publishing evidence', () => {
    const harness = createHarness()
    harness.hello()
    vi.advanceTimersByTime(1000)
    expect(harness.frames.at(-1)).toHaveProperty('feedReceivedAtMs')
    for (const action of ['focus', 'send', 'respond', 'peek', 'start'] as const) {
      expect(harness.source[action]).not.toHaveBeenCalled()
    }
    harness.unsubscribe()
  })

  it('initializes an editable world from actual accepted sessions without overwriting legacy storage', () => {
    const harness = createHarness({ worldEditing: true })
    harness.hello()
    vi.advanceTimersByTime(100)
    expect(harness.feed.getWorldDocumentStore?.()?.get().document.rooms).toEqual(
      expect.arrayContaining([expect.objectContaining({ target: `session:${session.key}` })])
    )
    expect(harness.frames.at(-1)?.floors[0].buildingId).toBeDefined()
    expect(harness.feed.getWorldDocumentStore?.()?.get().unsaved).toBe(true)
    harness.unsubscribe()
  })

  it('adds newly discovered editable targets after an initially empty hello', () => {
    const harness = createHarness({ worldEditing: true })
    harness.emit({
      type: 'hello',
      v: 1,
      snapshot: { rev: 0, generatedAtMs: 1000, sessions: [], sources: [] }
    })
    harness.emit({ type: 'patch', v: 1, seq: 1, removed: [], upserts: [session] })
    vi.advanceTimersByTime(100)
    expect(harness.feed.getWorldDocumentStore?.()?.get().document.rooms).toEqual(
      expect.arrayContaining([expect.objectContaining({ target: `session:${session.key}` })])
    )
    harness.unsubscribe()
  })
})
