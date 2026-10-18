// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import type { OfficeBridgeApi } from '../../../preload/office'
import { browserFrameEnv } from '../logic/frame-governor'
import { createLiveFeed, type FeedSource } from '../../office-live/live-feed'
import { World } from '../../../office/sim/world'
import { buildFixtureFrame } from '../fixture/fixture-feed'
import type { FeedMessage } from '../../../shared/office/types'
import type { OfficeFrame } from '../scene-model'

const transport = vi.hoisted(
  (): {
    api?: OfficeBridgeApi
    handlers: Map<string, (event: unknown, payload: unknown) => void>
  } => ({
    handlers: new Map<string, (event: unknown, payload: unknown) => void>()
  })
)
vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, api: OfficeBridgeApi) => {
      transport.api = api
    }
  },
  ipcRenderer: {
    on: (channel: string, handler: (event: unknown, payload: unknown) => void) => {
      transport.handlers.set(channel, handler)
    },
    invoke: vi.fn().mockResolvedValue(undefined),
    removeListener: vi.fn()
  }
}))

afterEach(() => {
  delete window.officeBridge
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('uses native visibility when Chromium still says the page is visible', async () => {
  await import('../../../preload/office')
  const api = transport.api
  if (!api) throw new Error('Preload API absent')
  window.officeBridge = api
  transport.handlers.get('office:visibility')?.({}, false)
  expect(document.hidden).toBe(false)
  expect(browserFrameEnv().read().isHidden).toBe(true)
  transport.handlers.get('office:visibility')?.({}, true)
  expect(browserFrameEnv().read().isHidden).toBe(false)
})

it('validates native visibility payloads and removes subscriptions', async () => {
  await import('../../../preload/office')
  const api = transport.api
  if (!api) throw new Error('Preload API absent')
  const listener = vi.fn()
  const unsubscribe = api.onVisibilityChanged(listener)
  transport.handlers.get('office:visibility')?.({}, true)
  listener.mockClear()
  transport.handlers.get('office:visibility')?.({}, 'false')
  expect(api.isVisible()).toBe(true)
  expect(listener).not.toHaveBeenCalled()
  transport.handlers.get('office:visibility')?.({}, false)
  expect(api.isVisible()).toBe(false)
  expect(listener).toHaveBeenCalledOnce()
  unsubscribe()
  transport.handlers.get('office:visibility')?.({}, true)
  expect(listener).toHaveBeenCalledOnce()
})

it('wakes the governor on native visibility changes', async () => {
  await import('../../../preload/office')
  const api = transport.api
  if (!api) throw new Error('Preload API absent')
  window.officeBridge = api
  const callback = vi.fn()
  const stop = browserFrameEnv().onChange(callback)
  transport.handlers.get('office:visibility')?.({}, false)
  expect(callback).toHaveBeenCalledOnce()
  stop()
  transport.handlers.get('office:visibility')?.({}, true)
  expect(callback).toHaveBeenCalledOnce()
})

it('keeps provider updates while hidden without visual steps or a resume catch-up', () => {
  vi.useFakeTimers()
  let isHidden = true
  let receive: ((message: FeedMessage) => void) | undefined
  const changes = new Set<() => void>()
  const source: FeedSource = {
    ready: async () => {},
    onFeedMessage: (listener) => {
      receive = listener
      return () => {
        receive = undefined
      }
    },
    focus: async () => ({ success: true, target: 'pane' }),
    send: async () => ({ success: true }),
    respond: async () => ({ success: true }),
    peek: async () => ({ success: true, lines: [] }),
    start: async () => ({ success: true })
  }
  const frames: OfficeFrame[] = []
  const steps = vi.spyOn(World.prototype, 'step')
  const unsubscribe = createLiveFeed(source, {
    storage: null,
    visibility: {
      read: () => ({ isHidden, isFocused: !isHidden }),
      onChange: (listener) => {
        changes.add(listener)
        return () => {
          changes.delete(listener)
        }
      }
    }
  }).subscribe((frame) => frames.push(frame))
  const sessions = buildFixtureFrame(0, Date.now()).sessions
  receive?.({
    type: 'hello',
    v: 1,
    snapshot: { rev: 0, generatedAtMs: Date.now(), sessions, sources: [] }
  })
  vi.advanceTimersByTime(60000)
  expect(steps).not.toHaveBeenCalled()
  receive?.({
    type: 'patch',
    v: 1,
    seq: 1,
    upserts: [{ ...sessions[0], name: 'Updated while hidden' }],
    removed: [],
    sources: []
  })
  isHidden = false
  for (const change of changes) change()
  vi.advanceTimersByTime(100)
  expect(steps).toHaveBeenCalledWith(100)
  expect(frames.at(-1)?.sessions.find((session) => session.key === sessions[0].key)?.name).toBe(
    'Updated while hidden'
  )
  unsubscribe()
  expect(receive).toBeUndefined()
  expect(changes.size).toBe(0)
})
