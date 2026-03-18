import { EventEmitter } from 'events'
import type { ClaudeInstance, SessionHistoryEntry, InstanceUpdate } from '../renderer/lib/types'
import type { ProcessMonitor } from './process-monitor'

export class SessionTracker extends EventEmitter {
  private monitor: ProcessMonitor
  private maxHistoryEntries: number
  private staleThresholdMinutes: number
  private instances: Map<number, ClaudeInstance> = new Map()
  private history: SessionHistoryEntry[] = []
  private intervalId: ReturnType<typeof setInterval> | null = null
  private polling = false
  /** Cooldown map: PID → timestamp of last active→idle emission */
  private idleCooldowns: Map<number, number> = new Map()
  private static readonly IDLE_COOLDOWN_MS = 60_000
  private static readonly MIN_ACTIVE_DURATION_MS = 30_000
  /** Hysteresis: require N consecutive polls confirming a new state before accepting */
  private statusConfirmations: Map<number, { status: string; count: number }> = new Map()
  private requiredConfirmations: number
  /** Track when each PID first became active in its current active period */
  private activeSince: Map<number, number> = new Map()

  constructor(
    monitor: ProcessMonitor,
    settings: {
      maxHistoryEntries: number
      staleThresholdMinutes: number
      requiredConfirmations?: number
    }
  ) {
    super()
    this.monitor = monitor
    this.maxHistoryEntries = settings.maxHistoryEntries
    this.staleThresholdMinutes = settings.staleThresholdMinutes
    this.requiredConfirmations = settings.requiredConfirmations ?? 2
  }

  start(intervalMs: number): void {
    // Stop any existing interval
    this.stop()

    void this.doPoll()

    this.intervalId = setInterval(() => {
      void this.doPoll()
    }, intervalMs)
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  setStaleThreshold(minutes: number): void {
    this.staleThresholdMinutes = minutes
  }

  getInstances(): ClaudeInstance[] {
    return Array.from(this.instances.values())
  }

  getHistory(): SessionHistoryEntry[] {
    return [...this.history]
  }

  getStats(): {
    total: number
    active: number
    idle: number
    stale: number
    exited: number
    recentlyCompleted: number
  } {
    const instanceList = this.getInstances()
    const nonStale = instanceList.filter((i) => i.status !== 'stale')
    const now = Date.now()
    const RECENT_WINDOW = 10 * 60 * 1000 // 10 minutes
    return {
      total: nonStale.length,
      active: nonStale.filter((i) => i.status === 'active').length,
      idle: nonStale.filter((i) => i.status === 'idle').length,
      stale: instanceList.filter((i) => i.status === 'stale').length,
      exited: this.history.length,
      recentlyCompleted: nonStale.filter(
        (i) =>
          i.status === 'idle' &&
          i.lastBecameIdleAt &&
          now - new Date(i.lastBecameIdleAt).getTime() < RECENT_WINDOW
      ).length
    }
  }

  clearHistory(): void {
    this.history = []
  }

  private async doPoll(): Promise<void> {
    if (this.polling) return
    this.polling = true

    let currentProcesses: ClaudeInstance[]
    try {
      currentProcesses = await this.monitor.poll()
    } catch {
      // Silently skip this poll cycle on error
      this.polling = false
      return
    }

    const currentPids = new Set(currentProcesses.map((p) => p.pid))
    const previousPids = new Set(this.instances.keys())
    const now = Date.now()

    // Detect new instances and track active start time
    for (const proc of currentProcesses) {
      if (!previousPids.has(proc.pid)) {
        this.emit('instance-appeared', proc)
        if (proc.status === 'active') {
          this.activeSince.set(proc.pid, now)
        }
      }
    }

    // Hysteresis: require N consecutive polls confirming a new state before accepting
    for (const proc of currentProcesses) {
      const prev = this.instances.get(proc.pid)
      if (!prev) continue // New PID — accept raw status immediately (no hysteresis)

      const confirmedBase = prev.status === 'stale' ? 'idle' : prev.status
      const rawBase = proc.status // always active|idle from monitor

      if (confirmedBase !== rawBase) {
        // Raw status differs from confirmed — check/increment confirmation counter
        const pending = this.statusConfirmations.get(proc.pid)
        if (pending && pending.status === rawBase) {
          pending.count++
          if (pending.count >= this.requiredConfirmations) {
            // Confirmed: allow transition through
            this.statusConfirmations.delete(proc.pid)
          } else {
            // Not yet confirmed: suppress by reverting to confirmed status
            proc.status = confirmedBase as 'active' | 'idle'
          }
        } else {
          // First poll with this new status — start counting
          this.statusConfirmations.set(proc.pid, { status: rawBase, count: 1 })
          if (this.requiredConfirmations > 1) {
            proc.status = confirmedBase as 'active' | 'idle'
          }
        }
      } else {
        // Raw status matches confirmed — clear any pending confirmation
        this.statusConfirmations.delete(proc.pid)
      }
    }

    // Detect status changes for existing instances
    // Note: stale is a derived state from idle, so treat stale↔idle as equivalent
    // for status change detection purposes
    for (const proc of currentProcesses) {
      const prev = this.instances.get(proc.pid)
      if (prev) {
        const prevBase = prev.status === 'stale' ? 'idle' : prev.status
        const currBase = proc.status // proc.status is active|idle (possibly reverted by hysteresis)
        if (prevBase !== currBase) {
          // Stamp lastBecameIdleAt when instance transitions active → idle
          if (prevBase === 'active' && currBase === 'idle') {
            const lastEmit = this.idleCooldowns.get(proc.pid)
            // Suppress rapid active→idle flapping: skip if within cooldown window
            if (lastEmit && now - lastEmit < SessionTracker.IDLE_COOLDOWN_MS) {
              continue
            }
            // Suppress if active duration was too brief (not a real task)
            // Only applies after first ping (lastEmit exists) to avoid blocking initial task completion
            const activeStart = this.activeSince.get(proc.pid)
            if (
              lastEmit &&
              activeStart &&
              now - activeStart < SessionTracker.MIN_ACTIVE_DURATION_MS
            ) {
              continue
            }
            proc.lastBecameIdleAt = new Date()
            this.idleCooldowns.set(proc.pid, now)
            this.activeSince.delete(proc.pid)
          }
          // Track when idle→active transition starts
          if (prevBase === 'idle' && currBase === 'active') {
            this.activeSince.set(proc.pid, now)
          }
          this.emit('instance-status-changed', {
            instance: proc,
            previousStatus: prev.status
          })
        }
      }
    }

    // Clean up cooldowns and confirmations for PIDs that no longer exist
    for (const pid of this.idleCooldowns.keys()) {
      if (!currentPids.has(pid)) {
        this.idleCooldowns.delete(pid)
      }
    }
    for (const pid of this.statusConfirmations.keys()) {
      if (!currentPids.has(pid)) {
        this.statusConfirmations.delete(pid)
      }
    }
    for (const pid of this.activeSince.keys()) {
      if (!currentPids.has(pid)) {
        this.activeSince.delete(pid)
      }
    }

    // Detect exited instances
    for (const [pid, instance] of this.instances) {
      if (!currentPids.has(pid)) {
        const now = new Date()
        const entry: SessionHistoryEntry = {
          pid: instance.pid,
          projectPath: instance.projectPath,
          projectName: instance.projectName,
          status: 'exited',
          startedAt: instance.startedAt,
          endedAt: now,
          durationSeconds: Math.max(
            0,
            Math.floor((now.getTime() - instance.startedAt.getTime()) / 1000)
          ),
          flags: instance.flags,
          terminalApp: instance.terminalApp,
          terminalType: instance.terminalType,
          sessionType: instance.sessionType
        }

        this.history.push(entry)
        this.trimHistory()
        this.emit('instance-exited', entry)
      }
    }

    // Update current instances map — preserve startedAt, lastBecameIdleAt, lastActiveAt from previous polls
    const previousInstances = new Map(this.instances)
    this.instances.clear()
    const staleThresholdMs = this.staleThresholdMinutes * 60 * 1000

    for (const proc of currentProcesses) {
      // Clone to avoid mutating the monitor's cached objects
      const instance: ClaudeInstance = { ...proc }
      const prev = previousInstances.get(instance.pid)
      if (prev) {
        instance.startedAt = prev.startedAt
        // Preserve idle timestamp unless status changed back to active
        if (prev.lastBecameIdleAt && instance.status === 'idle') {
          instance.lastBecameIdleAt = prev.lastBecameIdleAt
        }
        // Preserve lastActiveAt from previous poll
        instance.lastActiveAt = prev.lastActiveAt
      }

      // Track lastActiveAt: stamp when instance is active (has CPU activity)
      if (instance.status === 'active') {
        instance.lastActiveAt = new Date()
      }

      // Mark stale: idle instances that haven't been active for longer than threshold
      if (instance.status === 'idle') {
        const referenceTime = instance.lastActiveAt
          ? new Date(instance.lastActiveAt).getTime()
          : new Date(instance.startedAt).getTime()
        if (now - referenceTime > staleThresholdMs) {
          instance.status = 'stale'
        }
      }

      this.instances.set(instance.pid, instance)
    }

    // Emit update event
    const update: InstanceUpdate = {
      instances: this.getInstances(),
      stats: this.getStats()
    }
    this.emit('update', update)
    this.polling = false
  }

  private trimHistory(): void {
    if (this.history.length > this.maxHistoryEntries) {
      this.history = this.history.slice(-this.maxHistoryEntries)
    }
  }
}
