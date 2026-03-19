import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AppSettings, ClaudeInstance, SessionHistoryEntry } from '../renderer/lib/types'
import { DEFAULT_SETTINGS } from '../renderer/lib/types'

// Use vi.hoisted so mocks are available in the factory
const { mockShow, mockIsSupported, MockNotification } = vi.hoisted(() => {
  const mockShow = vi.fn()
  const mockIsSupported = vi.fn().mockReturnValue(true)
  const MockNotification = vi.fn().mockImplementation(() => ({
    show: mockShow,
    on: vi.fn(),
    close: vi.fn()
  }))
  MockNotification.isSupported = mockIsSupported
  return { mockShow, mockIsSupported, MockNotification }
})

vi.mock('electron', () => ({
  Notification: MockNotification
}))

import { NotificationManager } from './notifications'

function makeInstance(overrides: Partial<ClaudeInstance> = {}): ClaudeInstance {
  return {
    pid: 1234,
    tty: '/dev/ttys001',
    status: 'idle',
    cpuPercent: 0.1,
    memPercent: 2.5,
    elapsedTime: '00:05:32',
    elapsedSeconds: 332,
    projectPath: '/Users/test/my-project',
    projectName: 'my-project',
    flags: [],
    startedAt: new Date('2026-01-01T10:00:00'),
    ...overrides
  }
}

function makeHistoryEntry(overrides: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry {
  return {
    pid: 1234,
    projectPath: '/Users/test/my-project',
    projectName: 'my-project',
    status: 'exited',
    startedAt: new Date('2026-01-01T10:00:00'),
    endedAt: new Date('2026-01-01T10:05:32'),
    durationSeconds: 332,
    flags: [],
    ...overrides
  }
}

describe('NotificationManager', () => {
  let settings: AppSettings
  let manager: NotificationManager

  beforeEach(() => {
    vi.clearAllMocks()
    settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
    manager = new NotificationManager(() => settings)
  })

  describe('notifyTaskComplete', () => {
    it('should show notification when onTaskComplete is enabled', () => {
      settings.notifications.onTaskComplete = true
      settings.notifications.doNotDisturb = false

      manager.notifyTaskComplete(makeInstance({ projectName: 'cool-app', elapsedTime: '00:10:00' }))

      expect(MockNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Task complete'),
          body: expect.stringContaining('cool-app')
        })
      )
      expect(mockShow).toHaveBeenCalled()
    })

    it('should always use silent: true (sound handled by SoundPlayer)', () => {
      settings.notifications.onTaskComplete = true
      settings.notifications.doNotDisturb = false
      settings.notifications.sound = true

      manager.notifyTaskComplete(makeInstance())

      expect(MockNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          silent: true
        })
      )
    })

    it('should NOT show notification when onTaskComplete is disabled', () => {
      settings.notifications.onTaskComplete = false
      manager.notifyTaskComplete(makeInstance())
      expect(MockNotification).not.toHaveBeenCalled()
    })

    it('should NOT show notification when doNotDisturb is enabled', () => {
      settings.notifications.onTaskComplete = true
      settings.notifications.doNotDisturb = true
      manager.notifyTaskComplete(makeInstance())
      expect(MockNotification).not.toHaveBeenCalled()
    })

    it('should include elapsed time in notification body', () => {
      settings.notifications.onTaskComplete = true
      settings.notifications.doNotDisturb = false

      manager.notifyTaskComplete(makeInstance({ elapsedTime: '01:23:45' }))

      expect(MockNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('01:23:45')
        })
      )
    })
  })

  describe('task complete vs idle deduplication', () => {
    it('notifyTaskComplete and notifyIdle are independent methods', () => {
      // Both can be called, but the main process logic should only call one
      settings.notifications.onTaskComplete = true
      settings.notifications.onIdle = true
      settings.notifications.doNotDisturb = false

      manager.notifyTaskComplete(makeInstance())
      expect(mockShow).toHaveBeenCalledTimes(1)

      vi.clearAllMocks()

      manager.notifyIdle(makeInstance())
      expect(mockShow).toHaveBeenCalledTimes(1)
    })
  })

  describe('notifyIdle', () => {
    it('should show notification when onIdle is enabled', () => {
      settings.notifications.onIdle = true
      settings.notifications.doNotDisturb = false

      manager.notifyIdle(makeInstance({ projectName: 'cool-app', elapsedTime: '00:10:00' }))

      expect(MockNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Claude finished',
          body: expect.stringContaining('cool-app')
        })
      )
      expect(mockShow).toHaveBeenCalled()
    })

    it('should include elapsed time in notification body', () => {
      settings.notifications.onIdle = true
      settings.notifications.doNotDisturb = false

      manager.notifyIdle(makeInstance({ elapsedTime: '01:23:45' }))

      expect(MockNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('01:23:45')
        })
      )
    })

    it('should NOT show notification when onIdle is disabled', () => {
      settings.notifications.onIdle = false
      manager.notifyIdle(makeInstance())
      expect(MockNotification).not.toHaveBeenCalled()
      expect(mockShow).not.toHaveBeenCalled()
    })

    it('should NOT show notification when doNotDisturb is enabled', () => {
      settings.notifications.onIdle = true
      settings.notifications.doNotDisturb = true
      manager.notifyIdle(makeInstance())
      expect(MockNotification).not.toHaveBeenCalled()
      expect(mockShow).not.toHaveBeenCalled()
    })
  })

  describe('notifyExited', () => {
    it('should show notification when onExited is enabled', () => {
      settings.notifications.onExited = true
      settings.notifications.doNotDisturb = false

      manager.notifyExited(makeHistoryEntry({ projectName: 'my-api', durationSeconds: 600 }))

      expect(MockNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Claude session ended',
          body: expect.stringContaining('my-api')
        })
      )
      expect(mockShow).toHaveBeenCalled()
    })

    it('should include formatted duration in notification body', () => {
      settings.notifications.onExited = true
      settings.notifications.doNotDisturb = false

      manager.notifyExited(makeHistoryEntry({ durationSeconds: 3661 }))

      expect(MockNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringMatching(/1h\s+1m/)
        })
      )
    })

    it('should NOT show notification when onExited is disabled', () => {
      settings.notifications.onExited = false
      manager.notifyExited(makeHistoryEntry())
      expect(MockNotification).not.toHaveBeenCalled()
    })

    it('should NOT show notification when doNotDisturb is enabled', () => {
      settings.notifications.onExited = true
      settings.notifications.doNotDisturb = true
      manager.notifyExited(makeHistoryEntry())
      expect(MockNotification).not.toHaveBeenCalled()
    })
  })

  describe('settings reactivity', () => {
    it('should respect settings changes between calls', () => {
      settings.notifications.onIdle = true
      settings.notifications.doNotDisturb = false
      manager.notifyIdle(makeInstance())
      expect(mockShow).toHaveBeenCalledTimes(1)

      settings.notifications.onIdle = false
      manager.notifyIdle(makeInstance())
      expect(mockShow).toHaveBeenCalledTimes(1) // still 1
    })
  })

  describe('notification sound setting', () => {
    it('should pass silent: false when sound is enabled', () => {
      settings.notifications.onIdle = true
      settings.notifications.doNotDisturb = false
      settings.notifications.sound = true

      manager.notifyIdle(makeInstance())

      expect(MockNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          silent: false
        })
      )
    })

    it('should pass silent: true when sound is disabled', () => {
      settings.notifications.onIdle = true
      settings.notifications.doNotDisturb = false
      settings.notifications.sound = false

      manager.notifyIdle(makeInstance())

      expect(MockNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          silent: true
        })
      )
    })

    it('should pass silent option on exited notifications too', () => {
      settings.notifications.onExited = true
      settings.notifications.doNotDisturb = false
      settings.notifications.sound = false

      manager.notifyExited(makeHistoryEntry())

      expect(MockNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          silent: true
        })
      )
    })
  })

  describe('formatDuration via notifyExited', () => {
    beforeEach(() => {
      settings.notifications.onExited = true
      settings.notifications.doNotDisturb = false
    })

    it('should format seconds-only durations', () => {
      manager.notifyExited(makeHistoryEntry({ durationSeconds: 45 }))
      expect(MockNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('45s')
        })
      )
    })

    it('should format minute durations', () => {
      manager.notifyExited(makeHistoryEntry({ durationSeconds: 125 }))
      expect(MockNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('2m 5s')
        })
      )
    })
  })

  describe('isSupported()', () => {
    it('should return true when Notification.isSupported() returns true', () => {
      mockIsSupported.mockReturnValue(true)
      expect(manager.isSupported()).toBe(true)
    })

    it('should return false when Notification.isSupported() returns false', () => {
      mockIsSupported.mockReturnValue(false)
      expect(manager.isSupported()).toBe(false)
    })
  })

  describe('sendTest', () => {
    it('should return { sent: true } when supported', () => {
      mockIsSupported.mockReturnValue(true)
      const result = manager.sendTest()
      expect(result).toEqual({ sent: true })
      expect(MockNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Test notification'),
          body: 'ClaudeWatch notifications are working!'
        })
      )
      expect(mockShow).toHaveBeenCalled()
    })

    it('should return { sent: false, reason: "..." } when not supported', () => {
      mockIsSupported.mockReturnValue(false)
      const result = manager.sendTest()
      expect(result).toEqual({
        sent: false,
        reason: 'Notifications not supported — check macOS settings'
      })
      expect(MockNotification).not.toHaveBeenCalled()
      expect(mockShow).not.toHaveBeenCalled()
    })
  })

  describe('muted projects', () => {
    it('notifyTaskComplete should skip muted projects', () => {
      settings.notifications.onTaskComplete = true
      settings.notifications.doNotDisturb = false
      settings.notifications.mutedProjects = ['/Users/test/my-project']

      manager.notifyTaskComplete(makeInstance({ projectPath: '/Users/test/my-project' }))

      expect(MockNotification).not.toHaveBeenCalled()
      expect(mockShow).not.toHaveBeenCalled()
    })

    it('notifyIdle should skip muted projects', () => {
      settings.notifications.onIdle = true
      settings.notifications.doNotDisturb = false
      settings.notifications.mutedProjects = ['/Users/test/my-project']

      manager.notifyIdle(makeInstance({ projectPath: '/Users/test/my-project' }))

      expect(MockNotification).not.toHaveBeenCalled()
      expect(mockShow).not.toHaveBeenCalled()
    })

    it('notifyExited should skip muted projects', () => {
      settings.notifications.onExited = true
      settings.notifications.doNotDisturb = false
      settings.notifications.mutedProjects = ['/Users/test/my-project']

      manager.notifyExited(makeHistoryEntry({ projectPath: '/Users/test/my-project' }))

      expect(MockNotification).not.toHaveBeenCalled()
      expect(mockShow).not.toHaveBeenCalled()
    })

    it('should still notify for non-muted projects', () => {
      mockIsSupported.mockReturnValue(true)
      settings.notifications.onTaskComplete = true
      settings.notifications.doNotDisturb = false
      settings.notifications.mutedProjects = ['/Users/test/other-project']

      manager.notifyTaskComplete(makeInstance({ projectPath: '/Users/test/my-project' }))

      expect(MockNotification).toHaveBeenCalled()
      expect(mockShow).toHaveBeenCalled()
    })
  })

  describe('permission guard (Notification.isSupported)', () => {
    beforeEach(() => {
      mockIsSupported.mockReturnValue(false)
    })

    it('should NOT show task-complete notification when isSupported is false', () => {
      settings.notifications.onTaskComplete = true
      settings.notifications.doNotDisturb = false

      manager.notifyTaskComplete(makeInstance())

      expect(MockNotification).not.toHaveBeenCalled()
      expect(mockShow).not.toHaveBeenCalled()
    })

    it('should NOT show idle notification when isSupported is false', () => {
      settings.notifications.onIdle = true
      settings.notifications.doNotDisturb = false

      manager.notifyIdle(makeInstance())

      expect(MockNotification).not.toHaveBeenCalled()
      expect(mockShow).not.toHaveBeenCalled()
    })

    it('should NOT show exited notification when isSupported is false', () => {
      settings.notifications.onExited = true
      settings.notifications.doNotDisturb = false

      manager.notifyExited(makeHistoryEntry())

      expect(MockNotification).not.toHaveBeenCalled()
      expect(mockShow).not.toHaveBeenCalled()
    })

    it('should show notifications normally when isSupported is true', () => {
      mockIsSupported.mockReturnValue(true)
      settings.notifications.onTaskComplete = true
      settings.notifications.doNotDisturb = false

      manager.notifyTaskComplete(makeInstance())

      expect(MockNotification).toHaveBeenCalled()
      expect(mockShow).toHaveBeenCalled()
    })
  })
})
