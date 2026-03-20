import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted so mocks are available in factory functions
const { mockHandle, mockQuit, mockApp } = vi.hoisted(() => {
  const mockHandle = vi.fn()
  const mockQuit = vi.fn()
  const mockApp = {
    quit: mockQuit,
    isQuitting: false
  }
  return { mockHandle, mockQuit, mockApp }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockHandle
  },
  app: mockApp,
  shell: {
    openExternal: vi.fn()
  },
  BrowserWindow: vi.fn()
}))

vi.mock('./terminal-opener', () => ({
  openTerminal: vi.fn().mockReturnValue({ success: true })
}))

import { setupIpcHandlers, forwardUpdatesToRenderer } from './ipc-handlers'
import type { SessionTracker } from './session-tracker'
import type { SettingsStore } from './store'
import type { UsageStatsReader } from './usage-stats'
import type { PromoChecker } from './promo-checker'
import type { RateLimitReader } from './rate-limit-reader'
import type { NotificationManager } from './notifications'

function makeTracker(overrides: Partial<SessionTracker> = {}): SessionTracker {
  return {
    getInstances: vi.fn().mockReturnValue([{ pid: 1 }, { pid: 2 }]),
    getStats: vi.fn().mockReturnValue({ total: 2, active: 1, idle: 1 }),
    getHistory: vi.fn().mockReturnValue([]),
    clearHistory: vi.fn(),
    on: vi.fn(),
    ...overrides
  } as unknown as SessionTracker
}

function makeStore(overrides: Partial<SettingsStore> = {}): SettingsStore {
  return {
    getSettings: vi.fn().mockReturnValue({ pollingIntervalMs: 3000 }),
    setSettings: vi.fn().mockReturnValue({ pollingIntervalMs: 5000 }),
    getHistory: vi.fn().mockReturnValue([{ pid: 10 }]),
    clearHistory: vi.fn(),
    ...overrides
  } as unknown as SettingsStore
}

function makeUsageReader(overrides = {}): UsageStatsReader {
  return {
    getLastData: vi.fn().mockReturnValue({
      totalInputTokens: 1000,
      totalCostUSD: 5.5,
      dataAvailable: true
    }),
    read: vi.fn().mockResolvedValue({
      totalInputTokens: 2000,
      totalCostUSD: 10.0,
      dataAvailable: true
    }),
    ...overrides
  } as unknown as UsageStatsReader
}

function makePromoChecker(overrides = {}): PromoChecker {
  return {
    getLastData: vi.fn().mockReturnValue({
      is2x: true,
      promoActive: true
    }),
    ...overrides
  } as unknown as PromoChecker
}

function makeRateLimitReader(overrides = {}): RateLimitReader {
  return {
    getLastData: vi.fn().mockReturnValue({
      window_5h: { used_percentage: 45, resets_at: '2026-03-20T20:00:00Z' },
      window_7d: { used_percentage: 62, resets_at: '2026-03-27T00:00:00Z' },
      updated_at: '2026-03-20T15:00:00Z',
      dataAvailable: true
    }),
    ...overrides
  } as unknown as RateLimitReader
}

describe('setupIpcHandlers', () => {
  let tracker: ReturnType<typeof makeTracker>
  let store: ReturnType<typeof makeStore>
  let usageReader: ReturnType<typeof makeUsageReader>
  let promoChecker: ReturnType<typeof makePromoChecker>
  let rateLimitReader: ReturnType<typeof makeRateLimitReader>
  let onOpenDashboard: ReturnType<typeof vi.fn>
  let handlers: Record<string, (...args: unknown[]) => unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    mockApp.isQuitting = false
    handlers = {}
    mockHandle.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    })

    tracker = makeTracker()
    store = makeStore()
    usageReader = makeUsageReader()
    promoChecker = makePromoChecker()
    rateLimitReader = makeRateLimitReader()
    onOpenDashboard = vi.fn()
    setupIpcHandlers({
      tracker,
      store,
      usageReader,
      promoChecker,
      rateLimitReader,
      onOpenDashboard
    })
  })

  describe('handler registration', () => {
    it('should register all expected IPC handlers', () => {
      const expectedChannels = [
        'instances:get',
        'settings:get',
        'settings:set',
        'history:get',
        'history:clear',
        'app:open-dashboard',
        'app:quit',
        'updater:check',
        'updater:download',
        'updater:install',
        'usage:get',
        'usage:refresh',
        'promo:get',
        'ratelimits:get',
        'notifications:check-permission',
        'notifications:open-settings',
        'notifications:send-test',
        'notifications:mute-project',
        'notifications:unmute-project',
        'terminal:open'
      ]

      for (const channel of expectedChannels) {
        expect(handlers[channel], `handler for "${channel}" should be registered`).toBeDefined()
      }

      expect(mockHandle).toHaveBeenCalledTimes(expectedChannels.length)
    })
  })

  describe('instances:get', () => {
    it('should return instances and stats from tracker', () => {
      const result = handlers['instances:get']()

      expect(tracker.getInstances).toHaveBeenCalledOnce()
      expect(tracker.getStats).toHaveBeenCalledOnce()
      expect(result).toEqual({
        instances: [{ pid: 1 }, { pid: 2 }],
        stats: { total: 2, active: 1, idle: 1 }
      })
    })
  })

  describe('settings:get', () => {
    it('should return settings from store', () => {
      const result = handlers['settings:get']()

      expect(store.getSettings).toHaveBeenCalledOnce()
      expect(result).toEqual({ pollingIntervalMs: 3000 })
    })
  })

  describe('settings:set', () => {
    it('should call store.setSettings with data and return updated settings', () => {
      const updatedSettings = { pollingIntervalMs: 5000, theme: 'light' }
      ;(store.getSettings as ReturnType<typeof vi.fn>).mockReturnValue(updatedSettings)

      const fakeEvent = {} as Electron.IpcMainInvokeEvent
      const result = handlers['settings:set'](fakeEvent, { pollingIntervalMs: 5000 })

      expect(store.setSettings).toHaveBeenCalledWith({ pollingIntervalMs: 5000 })
      expect(store.getSettings).toHaveBeenCalled()
      expect(result).toEqual(updatedSettings)
    })
  })

  describe('history:get', () => {
    it('should return history from store', () => {
      const result = handlers['history:get']()

      expect(store.getHistory).toHaveBeenCalledOnce()
      expect(result).toEqual([{ pid: 10 }])
    })
  })

  describe('history:clear', () => {
    it('should call store.clearHistory and return success', () => {
      const result = handlers['history:clear']()

      expect(store.clearHistory).toHaveBeenCalledOnce()
      expect(result).toEqual({ success: true })
    })
  })

  describe('app:open-dashboard', () => {
    it('should call onOpenDashboard callback and return success', () => {
      const result = handlers['app:open-dashboard']()

      expect(onOpenDashboard).toHaveBeenCalledOnce()
      expect(result).toEqual({ success: true })
    })
  })

  describe('app:quit', () => {
    it('should set app.isQuitting before calling app.quit', () => {
      mockQuit.mockImplementation(() => {
        expect(mockApp.isQuitting).toBe(true)
      })

      handlers['app:quit']()

      expect(mockApp.isQuitting).toBe(true)
      expect(mockQuit).toHaveBeenCalledOnce()
    })
  })

  describe('updater:install', () => {
    it('should set app.isQuitting before installing the update', () => {
      const quitAndInstall = vi.fn(() => {
        expect(mockApp.isQuitting).toBe(true)
      })

      setupIpcHandlers({
        tracker,
        store,
        updater: { quitAndInstall } as never,
        usageReader,
        promoChecker,
        onOpenDashboard
      })

      handlers['updater:install']()

      expect(mockApp.isQuitting).toBe(true)
      expect(quitAndInstall).toHaveBeenCalledOnce()
    })

    it('should not mark the app as quitting when no updater is available', () => {
      handlers['updater:install']()

      expect(mockApp.isQuitting).toBe(false)
    })
  })

  describe('usage:get', () => {
    it('should return last usage data from reader', () => {
      const result = handlers['usage:get']()

      expect(usageReader.getLastData).toHaveBeenCalledOnce()
      expect(result).toEqual(
        expect.objectContaining({ totalInputTokens: 1000, dataAvailable: true })
      )
    })
  })

  describe('usage:refresh', () => {
    it('should call reader.read and return result', async () => {
      const result = await handlers['usage:refresh']()

      expect(usageReader.read).toHaveBeenCalledOnce()
      expect(result).toEqual(
        expect.objectContaining({ totalInputTokens: 2000, dataAvailable: true })
      )
    })
  })

  describe('promo:get', () => {
    it('should return last promo data from checker', () => {
      const result = handlers['promo:get']()

      expect(promoChecker.getLastData).toHaveBeenCalledOnce()
      expect(result).toEqual(expect.objectContaining({ is2x: true, promoActive: true }))
    })
  })

  describe('ratelimits:get', () => {
    it('should return last rate limit data from reader', () => {
      const result = handlers['ratelimits:get']()

      expect(rateLimitReader.getLastData).toHaveBeenCalledOnce()
      expect(result).toEqual(
        expect.objectContaining({
          dataAvailable: true,
          window_5h: expect.objectContaining({ used_percentage: 45 })
        })
      )
    })

    it('should return null when rateLimitReader is not provided', () => {
      const localHandlers: Record<string, (...args: unknown[]) => unknown> = {}
      mockHandle.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
        localHandlers[channel] = handler
      })
      setupIpcHandlers({ tracker, store, onOpenDashboard })
      const result = localHandlers['ratelimits:get']()
      expect(result).toBeNull()
    })
  })

  describe('terminal:open', () => {
    it('should return { success: false } for empty string path', () => {
      const fakeEvent = {} as Electron.IpcMainInvokeEvent
      const result = handlers['terminal:open'](fakeEvent, '')

      expect(result).toEqual({ success: false })
    })

    it('should return { success: false } for relative path', () => {
      const fakeEvent = {} as Electron.IpcMainInvokeEvent
      const result = handlers['terminal:open'](fakeEvent, 'relative/path')

      expect(result).toEqual({ success: false })
    })

    it('should return { success: false } for undefined/null path', () => {
      const fakeEvent = {} as Electron.IpcMainInvokeEvent

      expect(handlers['terminal:open'](fakeEvent, undefined)).toEqual({ success: false })
      expect(handlers['terminal:open'](fakeEvent, null)).toEqual({ success: false })
    })
  })

  describe('notifications:mute-project', () => {
    it('should add project to muted list', () => {
      const mockNotifications = {
        isSupported: vi.fn().mockReturnValue(true),
        sendTest: vi.fn()
      } as unknown as NotificationManager

      const currentSettings = {
        pollingIntervalMs: 3000,
        notifications: { mutedProjects: [], onTaskComplete: true }
      }
      const storeWithMuted = makeStore({
        getSettings: vi.fn().mockReturnValue(currentSettings),
        setSettings: vi.fn().mockReturnValue(currentSettings)
      })

      setupIpcHandlers({
        tracker,
        store: storeWithMuted,
        usageReader,
        promoChecker,
        notifications: mockNotifications,
        onOpenDashboard
      })

      const fakeEvent = {} as Electron.IpcMainInvokeEvent
      handlers['notifications:mute-project'](fakeEvent, '/Users/test/my-project')

      expect(storeWithMuted.setSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          notifications: expect.objectContaining({
            mutedProjects: ['/Users/test/my-project']
          })
        })
      )
    })
  })

  describe('notifications:unmute-project', () => {
    it('should remove project from muted list', () => {
      const mockNotifications = {
        isSupported: vi.fn().mockReturnValue(true),
        sendTest: vi.fn()
      } as unknown as NotificationManager

      const currentSettings = {
        pollingIntervalMs: 3000,
        notifications: {
          mutedProjects: ['/Users/test/my-project', '/Users/test/other'],
          onTaskComplete: true
        }
      }
      const storeWithMuted = makeStore({
        getSettings: vi.fn().mockReturnValue(currentSettings),
        setSettings: vi.fn().mockReturnValue(currentSettings)
      })

      setupIpcHandlers({
        tracker,
        store: storeWithMuted,
        usageReader,
        promoChecker,
        notifications: mockNotifications,
        onOpenDashboard
      })

      const fakeEvent = {} as Electron.IpcMainInvokeEvent
      handlers['notifications:unmute-project'](fakeEvent, '/Users/test/my-project')

      expect(storeWithMuted.setSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          notifications: expect.objectContaining({
            mutedProjects: ['/Users/test/other']
          })
        })
      )
    })
  })
})

describe('forwardUpdatesToRenderer', () => {
  it('should register an update listener on the tracker', () => {
    const tracker = makeTracker()
    const getWindow = vi.fn()

    forwardUpdatesToRenderer(tracker, getWindow)

    expect(tracker.on).toHaveBeenCalledWith('update', expect.any(Function))
  })

  it('should send updates to window webContents when window exists and is not destroyed', () => {
    const tracker = makeTracker()
    let updateCallback: (data: unknown) => void = () => {}
    ;(tracker.on as ReturnType<typeof vi.fn>).mockImplementation(
      (_event: string, cb: (data: unknown) => void) => {
        updateCallback = cb
      }
    )

    const mockSend = vi.fn()
    const mockWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: { send: mockSend }
    }
    const getWindow = vi.fn().mockReturnValue(mockWindow)

    forwardUpdatesToRenderer(tracker, getWindow)

    const updateData = { instances: [{ pid: 1 }], stats: { total: 1 } }
    updateCallback(updateData)

    expect(getWindow).toHaveBeenCalled()
    expect(mockWindow.isDestroyed).toHaveBeenCalled()
    expect(mockSend).toHaveBeenCalledWith('instances:update', updateData)
  })

  it('should not send updates when getWindow returns null', () => {
    const tracker = makeTracker()
    let updateCallback: (data: unknown) => void = () => {}
    ;(tracker.on as ReturnType<typeof vi.fn>).mockImplementation(
      (_event: string, cb: (data: unknown) => void) => {
        updateCallback = cb
      }
    )

    const getWindow = vi.fn().mockReturnValue(null)

    forwardUpdatesToRenderer(tracker, getWindow)
    updateCallback({ some: 'data' })

    expect(getWindow).toHaveBeenCalled()
    // Should not throw
  })

  it('should not send updates when window is destroyed', () => {
    const tracker = makeTracker()
    let updateCallback: (data: unknown) => void = () => {}
    ;(tracker.on as ReturnType<typeof vi.fn>).mockImplementation(
      (_event: string, cb: (data: unknown) => void) => {
        updateCallback = cb
      }
    )

    const mockSend = vi.fn()
    const mockWindow = {
      isDestroyed: vi.fn().mockReturnValue(true),
      webContents: { send: mockSend }
    }
    const getWindow = vi.fn().mockReturnValue(mockWindow)

    forwardUpdatesToRenderer(tracker, getWindow)
    updateCallback({ some: 'data' })

    expect(getWindow).toHaveBeenCalled()
    expect(mockWindow.isDestroyed).toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })
})
