import { useState, useEffect } from 'react'
import { Activity, Moon, XCircle, Cpu, MemoryStick } from 'lucide-react'
import { cn, formatElapsedTime } from '../lib/utils'
import type { ClaudeInstance, InstanceUpdate } from '../lib/types'

const emptyStats: InstanceUpdate['stats'] = { total: 0, active: 0, idle: 0, exited: 0 }

const statusColors: Record<ClaudeInstance['status'], string> = {
  active: 'bg-status-active',
  idle: 'bg-status-idle',
  exited: 'bg-status-exited'
}

const statusIcons: Record<ClaudeInstance['status'], typeof Activity> = {
  active: Activity,
  idle: Moon,
  exited: XCircle
}

export function PopoverView() {
  const [instances, setInstances] = useState<ClaudeInstance[]>([])
  const [stats, setStats] = useState(emptyStats)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.api) return

    window.api.getInstances().then((data) => {
      setInstances(data.instances)
      setStats(data.stats)
    })

    const unsubscribe = window.api.onInstancesUpdate((data) => {
      setInstances(data.instances)
      setStats(data.stats)
    })

    return unsubscribe
  }, [])

  const sorted = [...instances].sort((a, b) => {
    const order: Record<string, number> = { active: 0, idle: 1, exited: 2 }
    const diff = (order[a.status] ?? 3) - (order[b.status] ?? 3)
    if (diff !== 0) return diff
    return b.cpuPercent - a.cpuPercent
  })

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface">
      {/* Compact header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-heading text-text-primary">ClaudeWatch</span>
        <div className="flex items-center gap-3 text-mono-sm tabular-nums">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-status-active" />
            <span className="text-status-active">{stats.active}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-status-idle" />
            <span className="text-status-idle">{stats.idle}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-status-exited" />
            <span className="text-status-exited">{stats.exited}</span>
          </span>
        </div>
      </div>

      {/* Instance list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 py-8">
            <span className="text-body text-text-tertiary">No instances detected</span>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sorted.map((inst) => (
              <PopoverInstanceRow key={inst.pid} instance={inst} />
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={() => window.api?.openDashboard()}
          className="flex-1 rounded-md bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/25"
        >
          Open Dashboard
        </button>
        <button
          type="button"
          onClick={() => window.api?.quit()}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-secondary"
        >
          Quit
        </button>
      </div>
    </div>
  )
}

function PopoverInstanceRow({ instance }: { instance: ClaudeInstance }) {
  const [elapsed, setElapsed] = useState(instance.elapsedSeconds)

  useEffect(() => {
    setElapsed(instance.elapsedSeconds)

    if (instance.status !== 'active' && instance.status !== 'idle') return

    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [instance.elapsedSeconds, instance.status, instance.pid])

  const StatusIcon = statusIcons[instance.status]

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      {/* Status dot */}
      <span
        className={cn(
          'inline-block h-2 w-2 shrink-0 rounded-full',
          statusColors[instance.status],
          instance.status === 'active' && 'animate-pulse-dot'
        )}
      />

      {/* Project name + metrics */}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-text-primary">
          {instance.projectName}
        </span>
        <div className="mt-0.5 flex items-center gap-3 text-[10px] text-text-tertiary">
          <span className="tabular-nums">{formatElapsedTime(elapsed)}</span>
          <span className="inline-flex items-center gap-0.5 tabular-nums">
            <Cpu className="h-2.5 w-2.5" aria-hidden="true" />
            {instance.cpuPercent.toFixed(1)}%
          </span>
          <span className="inline-flex items-center gap-0.5 tabular-nums">
            <MemoryStick className="h-2.5 w-2.5" aria-hidden="true" />
            {instance.memPercent.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Status icon */}
      <StatusIcon
        className={cn('h-3 w-3 shrink-0', {
          'text-status-active': instance.status === 'active',
          'text-status-idle': instance.status === 'idle',
          'text-status-exited': instance.status === 'exited'
        })}
        aria-label={instance.status}
      />
    </div>
  )
}
