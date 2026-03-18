import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SessionTracker } from './session-tracker'
import { ProcessMonitor } from './process-monitor'
import type { ClaudeInstance, SessionHistoryEntry } from '../renderer/lib/types'

// Helper to create a mock ClaudeInstance
function makeInstance(overrides: Partial<ClaudeInstance> = {}): ClaudeInstance {
  return {
    pid: 1000,
    tty: 'ttys001',
    status: 'active',
    cpuPercent: 25.0,
    memPercent: 1.5,
    elapsedTime: '05:00',
    elapsedSeconds: 300,
    projectPath: '/Users/test/project',
    projectName: 'test/project',
    flags: [],
    startedAt: new Date(),
    ...overrides
  }
}

// Create a mock ProcessMonitor
function createMockMonitor(): ProcessMonitor & { _setPollResult: (r: ClaudeInstance[]) => void } {
  let pollResult: ClaudeInstance[] = []
  const monitor = {
    poll: vi.fn(async () => pollResult),
    _setPollResult: (r: ClaudeInstance[]) => {
      pollResult = r
    }
  } as unknown as ProcessMonitor & { _setPollResult: (r: ClaudeInstance[]) => void }
  return monitor
}

describe('SessionTracker', () => {
  let monitor: ReturnType<typeof createMockMonitor>
  let tracker: SessionTracker

  beforeEach(() => {
    vi.useFakeTimers()
    monitor = createMockMonitor()
    tracker = new SessionTracker(monitor, {
      maxHistoryEntries: 5,
      staleThresholdMinutes: 30,
      requiredConfirmations: 1
    })
  })

  afterEach(() => {
    tracker.stop()
    vi.useRealTimers()
  })

  describe('getInstances()', () => {
    it('should return empty array before first poll', () => {
      expect(tracker.getInstances()).toEqual([])
    })

    it('should return current instances after poll', async () => {
      const instance = makeInstance({ pid: 100 })
      monitor._setPollResult([instance])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      const instances = tracker.getInstances()
      expect(instances).toHaveLength(1)
      expect(instances[0].pid).toBe(100)
    })
  })

  describe('getHistory()', () => {
    it('should return empty array initially', () => {
      expect(tracker.getHistory()).toEqual([])
    })

    it('should add exited instance to history when it disappears', async () => {
      const instance = makeInstance({ pid: 200, status: 'active' })
      monitor._setPollResult([instance])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      // Instance disappears
      monitor._setPollResult([])
      await vi.advanceTimersByTimeAsync(1000)

      const history = tracker.getHistory()
      expect(history).toHaveLength(1)
      expect(history[0].pid).toBe(200)
      expect(history[0].status).toBe('exited')
      expect(history[0].projectPath).toBe('/Users/test/project')
    })
  })

  describe('clearHistory()', () => {
    it('should clear all history entries', async () => {
      const instance = makeInstance({ pid: 300 })
      monitor._setPollResult([instance])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      monitor._setPollResult([])
      await vi.advanceTimersByTimeAsync(1000)

      expect(tracker.getHistory()).toHaveLength(1)

      tracker.clearHistory()
      expect(tracker.getHistory()).toEqual([])
    })
  })

  describe('getStats()', () => {
    it('should return correct stats', async () => {
      const active = makeInstance({ pid: 400, status: 'active' })
      const idle = makeInstance({ pid: 401, status: 'idle', cpuPercent: 0.1 })
      monitor._setPollResult([active, idle])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      const stats = tracker.getStats()
      expect(stats.total).toBe(2)
      expect(stats.active).toBe(1)
      expect(stats.idle).toBe(1)
      expect(stats.exited).toBe(0)
    })

    it('should count exited instances from history', async () => {
      const instance = makeInstance({ pid: 500 })
      monitor._setPollResult([instance])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      monitor._setPollResult([])
      await vi.advanceTimersByTimeAsync(1000)

      const stats = tracker.getStats()
      expect(stats.total).toBe(0)
      expect(stats.exited).toBe(1)
    })
  })

  describe('event emissions', () => {
    it("should emit 'instance-appeared' when new PID appears", async () => {
      const handler = vi.fn()
      tracker.on('instance-appeared', handler)

      const instance = makeInstance({ pid: 600 })
      monitor._setPollResult([instance])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0].pid).toBe(600)
    })

    it("should emit 'instance-exited' when PID disappears", async () => {
      const handler = vi.fn()
      tracker.on('instance-exited', handler)

      const instance = makeInstance({ pid: 700 })
      monitor._setPollResult([instance])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      monitor._setPollResult([])
      await vi.advanceTimersByTimeAsync(1000)

      expect(handler).toHaveBeenCalledTimes(1)
      const entry: SessionHistoryEntry = handler.mock.calls[0][0]
      expect(entry.pid).toBe(700)
      expect(entry.status).toBe('exited')
      expect(entry.durationSeconds).toBeGreaterThanOrEqual(0)
    })

    it("should include terminal fields in 'instance-exited' entry", async () => {
      const handler = vi.fn()
      tracker.on('instance-exited', handler)

      const instance = makeInstance({
        pid: 750,
        terminalApp: 'iTerm2',
        terminalType: 'iterm2',
        sessionType: 'cli'
      })
      monitor._setPollResult([instance])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      // Instance disappears
      monitor._setPollResult([])
      await vi.advanceTimersByTimeAsync(1000)

      expect(handler).toHaveBeenCalledTimes(1)
      const entry: SessionHistoryEntry = handler.mock.calls[0][0]
      expect(entry.terminalApp).toBe('iTerm2')
      expect(entry.terminalType).toBe('iterm2')
      expect(entry.sessionType).toBe('cli')
    })

    it("should emit 'instance-status-changed' when status changes", async () => {
      const handler = vi.fn()
      tracker.on('instance-status-changed', handler)

      const activeInstance = makeInstance({ pid: 800, status: 'active' })
      monitor._setPollResult([activeInstance])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      // Same PID, now idle
      const idleInstance = makeInstance({ pid: 800, status: 'idle' })
      monitor._setPollResult([idleInstance])
      await vi.advanceTimersByTimeAsync(1000)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0].instance.pid).toBe(800)
      expect(handler.mock.calls[0][0].instance.status).toBe('idle')
      expect(handler.mock.calls[0][0].previousStatus).toBe('active')
    })

    it("should emit 'update' on every poll cycle", async () => {
      const handler = vi.fn()
      tracker.on('update', handler)

      monitor._setPollResult([])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)
      await vi.advanceTimersByTimeAsync(1000)

      expect(handler).toHaveBeenCalledTimes(3)
    })

    it('should include stats in update event', async () => {
      const handler = vi.fn()
      tracker.on('update', handler)

      const instance = makeInstance({ pid: 900, status: 'active' })
      monitor._setPollResult([instance])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      const update = handler.mock.calls[0][0]
      expect(update.instances).toHaveLength(1)
      expect(update.stats.active).toBe(1)
      expect(update.stats.total).toBe(1)
    })
  })

  describe('lastBecameIdleAt metadata', () => {
    it('should stamp lastBecameIdleAt when active → idle', async () => {
      const handler = vi.fn()
      tracker.on('instance-status-changed', handler)

      const activeInstance = makeInstance({ pid: 850, status: 'active' })
      monitor._setPollResult([activeInstance])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      // Now goes idle
      const idleInstance = makeInstance({ pid: 850, status: 'idle' })
      monitor._setPollResult([idleInstance])
      await vi.advanceTimersByTimeAsync(1000)

      expect(handler).toHaveBeenCalledTimes(1)
      const changedInstance = handler.mock.calls[0][0].instance
      expect(changedInstance.lastBecameIdleAt).toBeInstanceOf(Date)
    })

    it('should preserve lastBecameIdleAt across polls while idle', async () => {
      const activeInstance = makeInstance({ pid: 860, status: 'active' })
      monitor._setPollResult([activeInstance])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      // Go idle
      const idleInstance = makeInstance({ pid: 860, status: 'idle' })
      monitor._setPollResult([idleInstance])
      await vi.advanceTimersByTimeAsync(1000)

      const firstIdleAt = tracker.getInstances()[0].lastBecameIdleAt

      // Another poll while still idle
      const stillIdle = makeInstance({ pid: 860, status: 'idle' })
      monitor._setPollResult([stillIdle])
      await vi.advanceTimersByTimeAsync(1000)

      const preserved = tracker.getInstances()[0].lastBecameIdleAt
      expect(preserved).toEqual(firstIdleAt)
    })

    it('should clear lastBecameIdleAt when instance goes back to active', async () => {
      const activeInstance = makeInstance({ pid: 870, status: 'active' })
      monitor._setPollResult([activeInstance])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      // Go idle
      monitor._setPollResult([makeInstance({ pid: 870, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      expect(tracker.getInstances()[0].lastBecameIdleAt).toBeDefined()

      // Go back to active
      monitor._setPollResult([makeInstance({ pid: 870, status: 'active' })])
      await vi.advanceTimersByTimeAsync(1000)

      expect(tracker.getInstances()[0].lastBecameIdleAt).toBeUndefined()
    })

    it('should suppress rapid active→idle flapping within cooldown window', async () => {
      const handler = vi.fn()
      tracker.on('instance-status-changed', handler)

      tracker.start(1000)

      // active
      monitor._setPollResult([makeInstance({ pid: 880, status: 'active' })])
      await vi.advanceTimersByTimeAsync(1000)

      // idle (1st) — should fire
      monitor._setPollResult([makeInstance({ pid: 880, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      // active again (quick flicker)
      monitor._setPollResult([makeInstance({ pid: 880, status: 'active' })])
      await vi.advanceTimersByTimeAsync(1000)

      // idle (2nd) — should be suppressed (within cooldown)
      monitor._setPollResult([makeInstance({ pid: 880, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      const taskCompletes = handler.mock.calls.filter(
        (c) => c[0].previousStatus === 'active' && c[0].instance.status === 'idle'
      )
      expect(taskCompletes).toHaveLength(1) // Only the first one fires
    })

    it('should allow active→idle after cooldown window expires', async () => {
      const handler = vi.fn()
      tracker.on('instance-status-changed', handler)

      tracker.start(1000)

      // active
      monitor._setPollResult([makeInstance({ pid: 881, status: 'active' })])
      await vi.advanceTimersByTimeAsync(1000)

      // idle (1st) — fires
      monitor._setPollResult([makeInstance({ pid: 881, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      // active again
      monitor._setPollResult([makeInstance({ pid: 881, status: 'active' })])
      await vi.advanceTimersByTimeAsync(1000)

      // Wait past the 60s cooldown AND 30s min active duration
      await vi.advanceTimersByTimeAsync(60_000)

      // idle (2nd) — should fire because cooldown expired and active duration met
      monitor._setPollResult([makeInstance({ pid: 881, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      const taskCompletes = handler.mock.calls.filter(
        (c) => c[0].previousStatus === 'active' && c[0].instance.status === 'idle'
      )
      expect(taskCompletes).toHaveLength(2)
    })

    it('should track cooldowns independently per PID', async () => {
      const handler = vi.fn()
      tracker.on('instance-status-changed', handler)

      tracker.start(1000)

      // Both active
      monitor._setPollResult([
        makeInstance({ pid: 882, status: 'active' }),
        makeInstance({ pid: 883, status: 'active' })
      ])
      await vi.advanceTimersByTimeAsync(1000)

      // Both go idle — both should fire
      monitor._setPollResult([
        makeInstance({ pid: 882, status: 'idle' }),
        makeInstance({ pid: 883, status: 'idle' })
      ])
      await vi.advanceTimersByTimeAsync(1000)

      const taskCompletes = handler.mock.calls.filter(
        (c) => c[0].previousStatus === 'active' && c[0].instance.status === 'idle'
      )
      expect(taskCompletes).toHaveLength(2)
    })

    it('should NOT stamp lastBecameIdleAt for instance that starts idle', async () => {
      const idleInstance = makeInstance({ pid: 890, status: 'idle' })
      monitor._setPollResult([idleInstance])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      expect(tracker.getInstances()[0].lastBecameIdleAt).toBeUndefined()
    })
  })

  describe('recentlyCompleted stats', () => {
    it('should count recently completed instances in stats', async () => {
      const activeInstance = makeInstance({ pid: 900, status: 'active' })
      monitor._setPollResult([activeInstance])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      // Go idle (task complete)
      monitor._setPollResult([makeInstance({ pid: 900, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      const stats = tracker.getStats()
      expect(stats.recentlyCompleted).toBe(1)
    })

    it('should not count instances idle without lastBecameIdleAt', async () => {
      // Instance that starts idle (no transition)
      monitor._setPollResult([makeInstance({ pid: 910, status: 'idle' })])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      const stats = tracker.getStats()
      expect(stats.recentlyCompleted).toBe(0)
    })

    it('should expire recentlyCompleted after 10 minutes', async () => {
      const activeInstance = makeInstance({ pid: 920, status: 'active' })
      monitor._setPollResult([activeInstance])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      // Go idle
      monitor._setPollResult([makeInstance({ pid: 920, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      expect(tracker.getStats().recentlyCompleted).toBe(1)

      // Advance 11 minutes
      await vi.advanceTimersByTimeAsync(11 * 60 * 1000)

      expect(tracker.getStats().recentlyCompleted).toBe(0)
    })
  })

  describe('history limits', () => {
    it('should respect maxHistoryEntries', async () => {
      // maxHistoryEntries is 5
      tracker.start(1000)

      for (let i = 0; i < 8; i++) {
        const instance = makeInstance({ pid: 1000 + i })
        monitor._setPollResult([instance])
        await vi.advanceTimersByTimeAsync(1000)

        monitor._setPollResult([])
        await vi.advanceTimersByTimeAsync(1000)
      }

      const history = tracker.getHistory()
      expect(history.length).toBeLessThanOrEqual(5)
    })
  })

  describe('start() and stop()', () => {
    it('should poll immediately when start() is called', async () => {
      monitor._setPollResult([makeInstance({ pid: 1200 })])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(0)

      expect(monitor.poll).toHaveBeenCalledTimes(1)
      expect(tracker.getInstances()).toHaveLength(1)
      expect(tracker.getInstances()[0].pid).toBe(1200)
    })

    it('should stop polling when stop() is called', async () => {
      const handler = vi.fn()
      tracker.on('update', handler)

      monitor._setPollResult([])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)
      expect(handler).toHaveBeenCalledTimes(2)

      tracker.stop()
      await vi.advanceTimersByTimeAsync(5000)
      expect(handler).toHaveBeenCalledTimes(2) // no more calls
    })

    it('should be safe to call stop() multiple times', () => {
      tracker.start(1000)
      tracker.stop()
      tracker.stop() // should not throw
    })

    it('should be safe to call start() multiple times (restarts)', async () => {
      const handler = vi.fn()
      tracker.on('update', handler)

      monitor._setPollResult([])

      tracker.start(1000)
      tracker.start(1000) // restart
      await vi.advanceTimersByTimeAsync(1000)

      // Should still work
      expect(handler).toHaveBeenCalled()
    })
  })

  describe('edge cases', () => {
    it('should handle poll errors gracefully', async () => {
      vi.mocked(monitor.poll).mockRejectedValueOnce(new Error('poll error'))
      const handler = vi.fn()
      tracker.on('update', handler)

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      // Should not throw, and should not emit update on error
      // Next poll should work normally
      monitor._setPollResult([makeInstance({ pid: 1100 })])
      await vi.advanceTimersByTimeAsync(1000)

      expect(handler).toHaveBeenCalled()
    })
  })

  describe('stale detection', () => {
    it('should mark idle instance as stale after threshold', async () => {
      // Use a short threshold for testing (5 minutes)
      tracker.stop()
      tracker = new SessionTracker(monitor, {
        maxHistoryEntries: 5,
        staleThresholdMinutes: 5,
        requiredConfirmations: 1
      })

      // Instance starts active
      const activeInstance = makeInstance({ pid: 2000, status: 'active' })
      monitor._setPollResult([activeInstance])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      // Instance goes idle
      monitor._setPollResult([makeInstance({ pid: 2000, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      // Should be idle, not stale yet
      expect(tracker.getInstances()[0].status).toBe('idle')

      // Advance past the 5-minute stale threshold
      await vi.advanceTimersByTimeAsync(6 * 60 * 1000)

      // Should now be stale
      expect(tracker.getInstances()[0].status).toBe('stale')
    })

    it('should exclude stale instances from stats.total', async () => {
      tracker.stop()
      tracker = new SessionTracker(monitor, {
        maxHistoryEntries: 5,
        staleThresholdMinutes: 5,
        requiredConfirmations: 1
      })

      // One active, one idle instance
      monitor._setPollResult([
        makeInstance({ pid: 2100, status: 'active' }),
        makeInstance({ pid: 2101, status: 'idle' })
      ])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      // Active goes idle, so now both are idle with lastActiveAt set
      monitor._setPollResult([
        makeInstance({ pid: 2100, status: 'idle' }),
        makeInstance({ pid: 2101, status: 'idle' })
      ])
      await vi.advanceTimersByTimeAsync(1000)

      // Before stale: total = 2
      expect(tracker.getStats().total).toBe(2)
      expect(tracker.getStats().stale).toBe(0)

      // Advance past threshold
      await vi.advanceTimersByTimeAsync(6 * 60 * 1000)

      // After stale: both should be stale, total = 0
      const stats = tracker.getStats()
      expect(stats.stale).toBe(2)
      expect(stats.total).toBe(0)
      expect(stats.active).toBe(0)
      expect(stats.idle).toBe(0)
    })

    it('should un-stale an instance that becomes active again', async () => {
      tracker.stop()
      tracker = new SessionTracker(monitor, {
        maxHistoryEntries: 5,
        staleThresholdMinutes: 5,
        requiredConfirmations: 1
      })

      // Instance starts active
      monitor._setPollResult([makeInstance({ pid: 2200, status: 'active' })])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      // Goes idle
      monitor._setPollResult([makeInstance({ pid: 2200, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      // Advance past threshold — becomes stale
      await vi.advanceTimersByTimeAsync(6 * 60 * 1000)
      expect(tracker.getInstances()[0].status).toBe('stale')

      // Instance becomes active again (CPU spike)
      monitor._setPollResult([makeInstance({ pid: 2200, status: 'active' })])
      await vi.advanceTimersByTimeAsync(1000)

      // Should be active, not stale
      expect(tracker.getInstances()[0].status).toBe('active')
      expect(tracker.getStats().total).toBe(1)
      expect(tracker.getStats().active).toBe(1)
      expect(tracker.getStats().stale).toBe(0)
    })

    it('should preserve lastActiveAt across polls', async () => {
      tracker.stop()
      tracker = new SessionTracker(monitor, {
        maxHistoryEntries: 5,
        staleThresholdMinutes: 30,
        requiredConfirmations: 1
      })

      // Instance starts active
      monitor._setPollResult([makeInstance({ pid: 2300, status: 'active' })])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      const firstActiveAt = tracker.getInstances()[0].lastActiveAt
      expect(firstActiveAt).toBeInstanceOf(Date)

      // Goes idle — lastActiveAt should be preserved
      monitor._setPollResult([makeInstance({ pid: 2300, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      const preserved = tracker.getInstances()[0].lastActiveAt
      expect(preserved).toEqual(firstActiveAt)
    })

    it('should use startedAt as reference for instances that were never active', async () => {
      tracker.stop()
      tracker = new SessionTracker(monitor, {
        maxHistoryEntries: 5,
        staleThresholdMinutes: 5,
        requiredConfirmations: 1
      })

      // Instance starts idle (never active)
      const startedAt = new Date()
      monitor._setPollResult([makeInstance({ pid: 2400, status: 'idle', startedAt })])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      // Not stale yet
      expect(tracker.getInstances()[0].status).toBe('idle')

      // Advance past threshold from startedAt
      await vi.advanceTimersByTimeAsync(6 * 60 * 1000)

      // Should be stale now (never had CPU activity, using startedAt as reference)
      expect(tracker.getInstances()[0].status).toBe('stale')
    })

    it('should not emit spurious status-changed events for idle→stale transitions', async () => {
      tracker.stop()
      tracker = new SessionTracker(monitor, {
        maxHistoryEntries: 5,
        staleThresholdMinutes: 5,
        requiredConfirmations: 1
      })

      const handler = vi.fn()
      tracker.on('instance-status-changed', handler)

      // Instance starts active
      monitor._setPollResult([makeInstance({ pid: 2500, status: 'active' })])

      tracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      // Goes idle — one status change event
      monitor._setPollResult([makeInstance({ pid: 2500, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      expect(handler).toHaveBeenCalledTimes(1)

      // Advance past threshold — becomes stale silently (no event)
      await vi.advanceTimersByTimeAsync(6 * 60 * 1000)
      expect(tracker.getInstances()[0].status).toBe('stale')

      // No additional status-changed events for idle→stale
      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  describe('hysteresis (requiredConfirmations: 2)', () => {
    let hTracker: SessionTracker
    let hMonitor: ReturnType<typeof createMockMonitor>

    beforeEach(() => {
      hMonitor = createMockMonitor()
      hTracker = new SessionTracker(hMonitor, {
        maxHistoryEntries: 5,
        staleThresholdMinutes: 30,
        requiredConfirmations: 2
      })
    })

    afterEach(() => {
      hTracker.stop()
    })

    it('should NOT transition active→idle on a single idle poll', async () => {
      const handler = vi.fn()
      hTracker.on('instance-status-changed', handler)

      // First poll: active
      hMonitor._setPollResult([makeInstance({ pid: 3000, status: 'active' })])
      hTracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      // Second poll: idle (1st idle reading — not yet confirmed)
      hMonitor._setPollResult([makeInstance({ pid: 3000, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      // Status should still be active (suppressed)
      expect(hTracker.getInstances()[0].status).toBe('active')
      const statusChanges = handler.mock.calls.filter(
        (c) => c[0].previousStatus === 'active' && c[0].instance.status === 'idle'
      )
      expect(statusChanges).toHaveLength(0)
    })

    it('should transition active→idle after 2 consecutive idle polls', async () => {
      const handler = vi.fn()
      hTracker.on('instance-status-changed', handler)

      // First poll: active
      hMonitor._setPollResult([makeInstance({ pid: 3001, status: 'active' })])
      hTracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      // Second poll: idle (1st idle reading)
      hMonitor._setPollResult([makeInstance({ pid: 3001, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      // Third poll: idle (2nd idle reading — confirmed!)
      hMonitor._setPollResult([makeInstance({ pid: 3001, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      expect(hTracker.getInstances()[0].status).toBe('idle')
      const statusChanges = handler.mock.calls.filter(
        (c) => c[0].previousStatus === 'active' && c[0].instance.status === 'idle'
      )
      expect(statusChanges).toHaveLength(1)
    })

    it('should reset confirmation counter when status flips back mid-confirmation', async () => {
      const handler = vi.fn()
      hTracker.on('instance-status-changed', handler)

      // active
      hMonitor._setPollResult([makeInstance({ pid: 3002, status: 'active' })])
      hTracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      // idle (1st reading)
      hMonitor._setPollResult([makeInstance({ pid: 3002, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      // active again — resets counter
      hMonitor._setPollResult([makeInstance({ pid: 3002, status: 'active' })])
      await vi.advanceTimersByTimeAsync(1000)

      // idle (1st reading again, counter was reset)
      hMonitor._setPollResult([makeInstance({ pid: 3002, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      // Still active because we need 2 consecutive idle polls
      expect(hTracker.getInstances()[0].status).toBe('active')

      // 2nd consecutive idle
      hMonitor._setPollResult([makeInstance({ pid: 3002, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      expect(hTracker.getInstances()[0].status).toBe('idle')
    })

    it('should NOT show idle session as active from a single CPU spike', async () => {
      const handler = vi.fn()
      hTracker.on('instance-status-changed', handler)

      // Start active, then go idle (confirmed after 2 polls)
      hMonitor._setPollResult([makeInstance({ pid: 3003, status: 'active' })])
      hTracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      hMonitor._setPollResult([makeInstance({ pid: 3003, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)
      hMonitor._setPollResult([makeInstance({ pid: 3003, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      expect(hTracker.getInstances()[0].status).toBe('idle')

      // Single active spike — should NOT transition
      hMonitor._setPollResult([makeInstance({ pid: 3003, status: 'active' })])
      await vi.advanceTimersByTimeAsync(1000)

      expect(hTracker.getInstances()[0].status).toBe('idle')
    })

    it('should transition idle→active after 2 consecutive active polls', async () => {
      const handler = vi.fn()
      hTracker.on('instance-status-changed', handler)

      // Start active, confirm idle
      hMonitor._setPollResult([makeInstance({ pid: 3004, status: 'active' })])
      hTracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      hMonitor._setPollResult([makeInstance({ pid: 3004, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)
      hMonitor._setPollResult([makeInstance({ pid: 3004, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      expect(hTracker.getInstances()[0].status).toBe('idle')

      // 1st active reading
      hMonitor._setPollResult([makeInstance({ pid: 3004, status: 'active' })])
      await vi.advanceTimersByTimeAsync(1000)
      expect(hTracker.getInstances()[0].status).toBe('idle')

      // 2nd active reading — confirmed!
      hMonitor._setPollResult([makeInstance({ pid: 3004, status: 'active' })])
      await vi.advanceTimersByTimeAsync(1000)
      expect(hTracker.getInstances()[0].status).toBe('active')
    })

    it('should accept new instances without confirmation', async () => {
      // New PID appears as active — should be accepted immediately
      hMonitor._setPollResult([makeInstance({ pid: 3005, status: 'active' })])
      hTracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      expect(hTracker.getInstances()[0].status).toBe('active')

      // New PID appears as idle — should also be accepted immediately
      hMonitor._setPollResult([
        makeInstance({ pid: 3005, status: 'active' }),
        makeInstance({ pid: 3006, status: 'idle' })
      ])
      await vi.advanceTimersByTimeAsync(1000)

      const instances = hTracker.getInstances()
      const idle = instances.find((i) => i.pid === 3006)
      expect(idle?.status).toBe('idle')
    })

    it('should track confirmations independently per PID', async () => {
      // Two active instances
      hMonitor._setPollResult([
        makeInstance({ pid: 3007, status: 'active' }),
        makeInstance({ pid: 3008, status: 'active' })
      ])
      hTracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      // PID 3007 goes idle, PID 3008 stays active
      hMonitor._setPollResult([
        makeInstance({ pid: 3007, status: 'idle' }),
        makeInstance({ pid: 3008, status: 'active' })
      ])
      await vi.advanceTimersByTimeAsync(1000)

      // PID 3007: 2nd idle (confirmed), PID 3008 goes idle (1st reading)
      hMonitor._setPollResult([
        makeInstance({ pid: 3007, status: 'idle' }),
        makeInstance({ pid: 3008, status: 'idle' })
      ])
      await vi.advanceTimersByTimeAsync(1000)

      const instances = hTracker.getInstances()
      expect(instances.find((i) => i.pid === 3007)?.status).toBe('idle')
      expect(instances.find((i) => i.pid === 3008)?.status).toBe('active') // not yet confirmed
    })

    it('should clean up confirmations for exited PIDs', async () => {
      hMonitor._setPollResult([makeInstance({ pid: 3009, status: 'active' })])
      hTracker.start(1000)
      await vi.advanceTimersByTimeAsync(1000)

      // Start confirming idle
      hMonitor._setPollResult([makeInstance({ pid: 3009, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      // PID exits
      hMonitor._setPollResult([])
      await vi.advanceTimersByTimeAsync(1000)

      // Verify it's in history (exited) and tracker has no instances
      expect(hTracker.getInstances()).toHaveLength(0)
      expect(hTracker.getHistory()).toHaveLength(1)
      expect(hTracker.getHistory()[0].pid).toBe(3009)
    })
  })

  describe('increased cooldown (60s)', () => {
    it('should suppress active→idle emission within 60s cooldown', async () => {
      const handler = vi.fn()
      tracker.on('instance-status-changed', handler)

      tracker.start(1000)

      // active
      monitor._setPollResult([makeInstance({ pid: 4000, status: 'active' })])
      await vi.advanceTimersByTimeAsync(1000)

      // idle (1st) — fires
      monitor._setPollResult([makeInstance({ pid: 4000, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      // active again
      monitor._setPollResult([makeInstance({ pid: 4000, status: 'active' })])
      await vi.advanceTimersByTimeAsync(1000)

      // Advance 45s (past old 30s cooldown, within new 60s)
      await vi.advanceTimersByTimeAsync(45_000)

      // idle (2nd) — should be suppressed under 60s cooldown
      monitor._setPollResult([makeInstance({ pid: 4000, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      const taskCompletes = handler.mock.calls.filter(
        (c) => c[0].previousStatus === 'active' && c[0].instance.status === 'idle'
      )
      expect(taskCompletes).toHaveLength(1) // Only the first one
    })

    it('should allow active→idle after 60s cooldown expires', async () => {
      const handler = vi.fn()
      tracker.on('instance-status-changed', handler)

      tracker.start(1000)

      // active
      monitor._setPollResult([makeInstance({ pid: 4001, status: 'active' })])
      await vi.advanceTimersByTimeAsync(1000)

      // idle (1st) — fires
      monitor._setPollResult([makeInstance({ pid: 4001, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      // active again
      monitor._setPollResult([makeInstance({ pid: 4001, status: 'active' })])
      await vi.advanceTimersByTimeAsync(1000)

      // Wait past 60s cooldown
      await vi.advanceTimersByTimeAsync(60_000)

      // idle (2nd) — should fire because cooldown expired
      monitor._setPollResult([makeInstance({ pid: 4001, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      const taskCompletes = handler.mock.calls.filter(
        (c) => c[0].previousStatus === 'active' && c[0].instance.status === 'idle'
      )
      expect(taskCompletes).toHaveLength(2)
    })
  })

  describe('minimum active duration', () => {
    it('should suppress active→idle ping if active for less than 30s (after first ping)', async () => {
      const handler = vi.fn()
      tracker.on('instance-status-changed', handler)

      tracker.start(1000)

      // First cycle: active for 30s+ then idle (establishes cooldown entry)
      monitor._setPollResult([makeInstance({ pid: 5000, status: 'active' })])
      await vi.advanceTimersByTimeAsync(1000)
      await vi.advanceTimersByTimeAsync(30_000) // 30s+ active

      monitor._setPollResult([makeInstance({ pid: 5000, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000) // 1st ping fires

      // Wait past 60s cooldown
      await vi.advanceTimersByTimeAsync(60_000)

      // Second cycle: active for only 5s then idle
      monitor._setPollResult([makeInstance({ pid: 5000, status: 'active' })])
      await vi.advanceTimersByTimeAsync(1000)
      await vi.advanceTimersByTimeAsync(4000) // ~5s total active

      monitor._setPollResult([makeInstance({ pid: 5000, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      // Should have only 1 ping (the first one), second suppressed due to brief active
      const taskCompletes = handler.mock.calls.filter(
        (c) => c[0].previousStatus === 'active' && c[0].instance.status === 'idle'
      )
      expect(taskCompletes).toHaveLength(1)
    })

    it('should allow active→idle ping if active for 30s or more (after first ping)', async () => {
      const handler = vi.fn()
      tracker.on('instance-status-changed', handler)

      tracker.start(1000)

      // First cycle: establish cooldown
      monitor._setPollResult([makeInstance({ pid: 5001, status: 'active' })])
      await vi.advanceTimersByTimeAsync(1000)
      await vi.advanceTimersByTimeAsync(30_000)
      monitor._setPollResult([makeInstance({ pid: 5001, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000) // 1st ping fires

      // Wait past 60s cooldown
      await vi.advanceTimersByTimeAsync(60_000)

      // Second cycle: active for 30+ seconds
      monitor._setPollResult([makeInstance({ pid: 5001, status: 'active' })])
      await vi.advanceTimersByTimeAsync(1000)
      await vi.advanceTimersByTimeAsync(30_000)

      // idle — should fire (active long enough + past cooldown)
      monitor._setPollResult([makeInstance({ pid: 5001, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      const taskCompletes = handler.mock.calls.filter(
        (c) => c[0].previousStatus === 'active' && c[0].instance.status === 'idle'
      )
      expect(taskCompletes).toHaveLength(2) // Both pings fire
    })

    it('should still update internal status even when ping is suppressed', async () => {
      tracker.start(1000)

      // First cycle: establish cooldown
      monitor._setPollResult([makeInstance({ pid: 5002, status: 'active' })])
      await vi.advanceTimersByTimeAsync(1000)
      await vi.advanceTimersByTimeAsync(30_000)
      monitor._setPollResult([makeInstance({ pid: 5002, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      // Wait past cooldown
      await vi.advanceTimersByTimeAsync(60_000)

      // Second cycle: brief active (5s) then idle — suppressed
      monitor._setPollResult([makeInstance({ pid: 5002, status: 'active' })])
      await vi.advanceTimersByTimeAsync(1000)
      await vi.advanceTimersByTimeAsync(4000)
      monitor._setPollResult([makeInstance({ pid: 5002, status: 'idle' })])
      await vi.advanceTimersByTimeAsync(1000)

      // Internal status should be idle even though event was suppressed
      expect(tracker.getInstances()[0].status).toBe('idle')
    })
  })
})
