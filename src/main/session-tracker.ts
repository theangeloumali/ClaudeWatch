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

  constructor(
    monitor: ProcessMonitor,
    settings: { maxHistoryEntries: number; staleThresholdMinutes: number }
  ) {
    super()
    this.monitor = monitor
    this.maxHistoryEntries = settings.maxHistoryEntries
    this.staleThresholdMinutes = settings.staleThresholdMinutes
  }

  start(intervalMs: number): void {
    // Stop any existing interval
    this.stop()

    this.intervalId = setInterval(() => {
      this.doPoll()
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

    // Detect new instances
    for (const proc of currentProcesses) {
      if (!previousPids.has(proc.pid)) {
        this.emit('instance-appeared', proc)
      }
    }

    // Detect status changes for existing instances
    // Note: stale is a derived state from idle, so treat stale↔idle as equivalent
    // for status change detection purposes
    for (const proc of currentProcesses) {
      const prev = this.instances.get(proc.pid)
      if (prev) {
        const prevBase = prev.status === 'stale' ? 'idle' : prev.status
        const currBase = proc.status // proc.status is always active|idle from monitor
        if (prevBase !== currBase) {
          // Stamp lastBecameIdleAt when instance transitions active → idle
          if (prevBase === 'active' && currBase === 'idle') {
            proc.lastBecameIdleAt = new Date()
          }
          this.emit('instance-status-changed', {
            instance: proc,
            previousStatus: prev.status
          })
        }
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
          flags: instance.flags
        }

        this.history.push(entry)
        this.trimHistory()
        this.emit('instance-exited', entry)
      }
    }

    // Update current instances map — preserve startedAt, lastBecameIdleAt, lastActiveAt from previous polls
    const previousInstances = new Map(this.instances)
    this.instances.clear()
    const now = Date.now()
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
