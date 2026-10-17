import { afterEach, expect, it, vi } from 'vitest'
import type {
  AgentObservation,
  FeedMessage,
  SessionRef,
  SessionUsage
} from '../../../shared/office/types'
import { createLiveFeed, type FeedSource } from '../../office-live/live-feed'
import { createBuildingPlaces } from '../logic/building-place'
import { buildingIdOf } from '../logic/city-signals'
import { createCitySignalStore } from '../logic/city-signal-store'
import type { OfficeFrame } from '../scene-model'
import { createSpireStageFeed } from '../scene/SpireStageFeed'
import { makeSession } from './fixtures'

const T0 = new Date(2026, 9, 17, 9).getTime()
const HOME = buildingIdOf('c_test', 'p_1')
const ROOF = { x: 0, y: 6, z: 0 }

const usage = (tokens: number): SessionUsage => ({
  own: { input: tokens, output: 0, cacheWrite: 0, cacheRead: 0 },
  subagents: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
  spawned: 0,
  contextTokens: null,
  contextLimit: null
})
const seen = (atMs: number): AgentObservation => ({
  sourceId: 'claude',
  observedAtMs: atMs,
  staleAfterMs: 60_000,
  coverage: 'own'
})
const spending = (tokens: number, atMs: number): SessionRef =>
  makeSession({
    key: 'claude:a',
    activity: 'editing',
    usage: usage(tokens),
    observation: seen(atMs),
    updatedAtMs: atMs
  })

afterEach(() => vi.useRealTimers())

it('100 token patches write no spire or height into the saved world document', () => {
  vi.useFakeTimers({ now: T0 })
  const bridge = { send: (_message: FeedMessage): void => undefined }
  const source: FeedSource = {
    ready: () => Promise.resolve(),
    onFeedMessage: (listener) => {
      bridge.send = listener
      return () => undefined
    },
    focus: vi.fn(),
    send: vi.fn(),
    respond: vi.fn(),
    peek: vi.fn(),
    start: vi.fn()
  }
  const feed = createLiveFeed(source, { storage: null })
  const signals = createCitySignalStore()
  const places = createBuildingPlaces()
  places.setRoof(HOME, ROOF)
  const sync = createSpireStageFeed(signals, places, { now: () => Date.now() })
  feed.subscribe((frame: OfficeFrame) => {
    signals.update(frame, Date.now())
    sync()
  })
  bridge.send({
    type: 'hello',
    v: 1,
    snapshot: { rev: 1, generatedAtMs: T0, sessions: [spending(0, T0)], sources: [] }
  })
  vi.advanceTimersByTime(300)
  const savedAtStart = JSON.stringify(feed.getWorldDocumentStore?.()?.get().document)
  expect(savedAtStart).toContain(HOME)
  for (let seq = 1; seq <= 100; seq += 1) {
    const tokens = seq * 300_000
    bridge.send({
      type: 'patch',
      v: 1,
      seq,
      upserts: [spending(tokens, Date.now())],
      removed: [],
      projectsToday: [{ projectKey: 'p_1', tokens }]
    })
    vi.advanceTimersByTime(300)
  }
  // The precondition the rule depends on: the patches did raise the spire.
  expect(signals.current().buildings.get(HOME)?.spireStage).toBeGreaterThan(3)
  expect(places.place(HOME).topAt(Date.now(), true)?.y).toBeGreaterThan(ROOF.y)
  const saved = JSON.stringify(feed.getWorldDocumentStore?.()?.get().document)
  expect(saved).toBe(savedAtStart)
  expect(saved).not.toMatch(/spire|stage|tokensToday|height/i)
})
