import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SettingsStore } from './store'
import type { AppSettings, SessionHistoryEntry, DEFAULT_SETTINGS } from '../renderer/lib/types'

// Mock electron-store
vi.mock('electron-store', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      const data: Record<string, unknown> = {}
      return {
        get: vi.fn((key: string, defaultValue?: unknown) => {
          return key in data ? data[key] : defaultValue
        }),
        set: vi.fn((key: string, value: unknown) => {
          data[key] = value
        }),
        delete: vi.fn((key: string) => {
          delete data[key]
        }),
        has: vi.fn((key: string) => key in data),
        store: data
      }
    })
  }
})

describe('SettingsStore', () => {
  let store: SettingsStore

  beforeEach(() => {
    vi.clearAllMocks()
    store = new SettingsStore()
  })

  describe('getSettings()', () => {
    it('should return default settings when no settings are stored', () => {
      const settings = store.getSettings()
      expect(settings.pollingIntervalMs).toBe(3000)
      expect(settings.cpuIdleThreshold).toBe(3.0)
      expect(settings.launchAtLogin).toBe(false)
      expect(settings.notifications.onIdle).toBe(true)
      expect(settings.theme).toBe('dark')
      expect(settings.maxHistoryEntries).toBe(100)
    })
  })

  describe('setSettings()', () => {
    it('should update partial settings and return merged result', () => {
      const updated = store.setSettings({ pollingIntervalMs: 5000 })
      expect(updated.pollingIntervalMs).toBe(5000)
      // Other defaults preserved
      expect(updated.cpuIdleThreshold).toBe(3.0)
      expect(updated.theme).toBe('dark')
    })

    it('should update nested notification settings', () => {
      const updated = store.setSettings({
        notifications: {
          onIdle: false,
          onExited: true,
          onError: true,
          sound: false,
          doNotDisturb: true
        }
      })
      expect(updated.notifications.onIdle).toBe(false)
      expect(updated.notifications.sound).toBe(false)
      expect(updated.notifications.doNotDisturb).toBe(true)
    })

    it('should persist settings across getSettings calls', () => {
      store.setSettings({ theme: 'light' })
      const settings = store.getSettings()
      expect(settings.theme).toBe('light')
    })

    it('should handle multiple sequential updates', () => {
      store.setSettings({ pollingIntervalMs: 1000 })
      store.setSettings({ theme: 'system' })

      const settings = store.getSettings()
      expect(settings.pollingIntervalMs).toBe(1000)
      expect(settings.theme).toBe('system')
    })
  })

  describe('settings migration for new notification fields', () => {
    it('should provide default onTaskComplete when missing from stored settings', () => {
      const settings = store.getSettings()
      expect(settings.notifications.onTaskComplete).toBe(true)
    })

    it('should provide default pingSound when missing from stored settings', () => {
      const settings = store.getSettings()
      expect(settings.notifications.pingSound).toBe(true)
    })
  })

  describe('settings migration for minimizeToTray', () => {
    it('should provide default minimizeToTray (true) when missing from stored settings', () => {
      const settings = store.getSettings()
      expect(settings.minimizeToTray).toBe(true)
    })

    it('should preserve minimizeToTray when explicitly set to false', () => {
      store.setSettings({ minimizeToTray: false })
      const settings = store.getSettings()
      expect(settings.minimizeToTray).toBe(false)
    })

    it('should preserve minimizeToTray when explicitly set to true', () => {
      store.setSettings({ minimizeToTray: true })
      const settings = store.getSettings()
      expect(settings.minimizeToTray).toBe(true)
    })
  })

  describe('getHistory()', () => {
    it('should return empty array when no history exists', () => {
      expect(store.getHistory()).toEqual([])
    })
  })

  describe('addHistoryEntry()', () => {
    it('should add an entry to history', () => {
      const entry: SessionHistoryEntry = {
        pid: 12345,
        projectPath: '/Users/test/project',
        projectName: 'test/project',
        status: 'exited',
        startedAt: new Date('2026-03-18T10:00:00Z'),
        endedAt: new Date('2026-03-18T11:00:00Z'),
        durationSeconds: 3600,
        flags: ['--continue']
      }

      store.addHistoryEntry(entry)
      const history = store.getHistory()
      expect(history).toHaveLength(1)
      expect(history[0].pid).toBe(12345)
    })

    it('should maintain multiple history entries', () => {
      for (let i = 0; i < 3; i++) {
        store.addHistoryEntry({
          pid: 1000 + i,
          projectPath: `/project/${i}`,
          projectName: `project/${i}`,
          status: 'exited',
          startedAt: new Date(),
          endedAt: new Date(),
          durationSeconds: 100,
          flags: []
        })
      }

      expect(store.getHistory()).toHaveLength(3)
    })

    it('should trim history when exceeding maxHistoryEntries from settings', () => {
      // Default maxHistoryEntries is 100, but we test with smaller sets
      // The store should respect the maxHistoryEntries setting
      store.setSettings({ maxHistoryEntries: 3 })

      for (let i = 0; i < 5; i++) {
        store.addHistoryEntry({
          pid: 2000 + i,
          projectPath: `/project/${i}`,
          projectName: `project/${i}`,
          status: 'exited',
          startedAt: new Date(),
          endedAt: new Date(),
          durationSeconds: 100,
          flags: []
        })
      }

      const history = store.getHistory()
      expect(history.length).toBeLessThanOrEqual(3)
    })
  })

  describe('clearHistory()', () => {
    it('should remove all history entries', () => {
      store.addHistoryEntry({
        pid: 3000,
        projectPath: '/test',
        projectName: 'test',
        status: 'exited',
        startedAt: new Date(),
        endedAt: new Date(),
        durationSeconds: 60,
        flags: []
      })

      expect(store.getHistory()).toHaveLength(1)

      store.clearHistory()
      expect(store.getHistory()).toEqual([])
    })

    it('should not affect settings when clearing history', () => {
      store.setSettings({ theme: 'light' })
      store.clearHistory()
      expect(store.getSettings().theme).toBe('light')
    })
  })
})
