import { useState, useEffect, useMemo } from 'react'
import { Activity, Moon, XCircle, CheckCircle, Cpu, MemoryStick } from 'lucide-react'
import { cn, formatElapsedTime, formatCompactNumber, formatCurrency, timeAgo } from '../lib/utils'
import { useUsage } from '../hooks/useUsage'
import { usePromoStatus } from '../hooks/usePromoStatus'
import { useRateLimits } from '../hooks/useRateLimits'
import type { ClaudeInstance, InstanceUpdate, RateLimits } from '../lib/types'

const RECENT_WINDOW_MS = 10 * 60 * 1000

const emptyStats: InstanceUpdate['stats'] = {
  total: 0,
  active: 0,
  idle: 0,
  stale: 0,
  exited: 0,
  recentlyCompleted: 0
}

const statusColors: Record<ClaudeInstance['status'], string> = {
  active: 'bg-status-active',
  idle: 'bg-status-idle',
  stale: 'bg-text-tertiary',
  exited: 'bg-status-exited'
}

const statusIcons: Record<ClaudeInstance['status'], typeof Activity> = {
  active: Activity,
  idle: Moon,
  stale: Moon,
  exited: XCircle
}

interface GroupedInstances {
  recentlyCompleted: ClaudeInstance[]
  inProgress: ClaudeInstance[]
  waiting: ClaudeInstance[]
  stale: ClaudeInstance[]
}

export function PopoverView() {
  const [instances, setInstances] = useState<ClaudeInstance[]>([])
  const [stats, setStats] = useState(emptyStats)
  const { usage } = useUsage()
  const { promo } = usePromoStatus()
  const { rateLimits } = useRateLimits()

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
    const order: Record<string, number> = { active: 0, idle: 1, stale: 2, exited: 3 }
    const diff = (order[a.status] ?? 4) - (order[b.status] ?? 4)
    if (diff !== 0) return diff
    return b.cpuPercent - a.cpuPercent
  })

  // Tick every 30s so items age out of "Recently Done" without waiting for a poll
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(interval)
  }, [])

  const grouped = useMemo((): GroupedInstances => {
    const recentlyCompleted: ClaudeInstance[] = []
    const inProgress: ClaudeInstance[] = []
    const waiting: ClaudeInstance[] = []
    const stale: ClaudeInstance[] = []

    for (const inst of sorted) {
      if (inst.status === 'stale') {
        stale.push(inst)
      } else if (inst.status === 'active') {
        inProgress.push(inst)
      } else if (
        inst.status === 'idle' &&
        inst.lastBecameIdleAt &&
        now - new Date(inst.lastBecameIdleAt).getTime() < RECENT_WINDOW_MS
      ) {
        recentlyCompleted.push(inst)
      } else {
        waiting.push(inst)
      }
    }

    return { recentlyCompleted, inProgress, waiting, stale }
  }, [sorted, now])

  const hasGroupedContent =
    grouped.recentlyCompleted.length > 0 ||
    grouped.inProgress.length > 0 ||
    grouped.waiting.length > 0 ||
    grouped.stale.length > 0

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface">
      {/* Compact header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-heading text-text-primary">ClaudeWatch</span>
          {promo?.is2x && (
            <span className="rounded-full bg-status-active/20 px-1.5 py-0.5 text-[10px] font-semibold text-status-active">
              2x
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-mono-sm tabular-nums">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-status-active" />
            <span className="text-status-active">{stats.active}</span>
          </span>
          {stats.recentlyCompleted > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-emerald-400">{stats.recentlyCompleted}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-status-idle" />
            <span className="text-status-idle">{stats.idle}</span>
          </span>
          {stats.stale > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-text-tertiary" />
              <span className="text-text-tertiary">{stats.stale}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-status-exited" />
            <span className="text-status-exited">{stats.exited}</span>
          </span>
        </div>
      </div>

      {/* Usage bar */}
      {usage?.dataAvailable && (
        <div className="border-b border-border px-4 py-2">
          <div className="text-[11px] tabular-nums text-text-secondary">
            {formatCurrency(usage.totalCostUSD)} &middot;{' '}
            {formatCompactNumber(usage.totalInputTokens)} in &middot;{' '}
            {formatCompactNumber(usage.totalOutputTokens)} out
          </div>
          {usage.weeklyTokenTarget > 0 && (
            <PopoverWeeklyBar
              weeklyTokens={usage.weeklyTokens}
              weeklyTokenTarget={usage.weeklyTokenTarget}
            />
          )}
          {rateLimits?.dataAvailable && <PopoverRateLimitBars rateLimits={rateLimits} />}
        </div>
      )}

      {/* Rate limits standalone (when usage unavailable) */}
      {!usage?.dataAvailable && rateLimits?.dataAvailable && (
        <div className="border-b border-border px-4 py-2">
          <PopoverRateLimitBars rateLimits={rateLimits} />
        </div>
      )}

      {/* Instance list with groups */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!hasGroupedContent ? (
          <div className="flex h-full items-center justify-center px-4 py-8">
            <span className="text-body text-text-tertiary">No instances detected</span>
          </div>
        ) : (
          <div>
            {grouped.inProgress.length > 0 && (
              <PopoverSection
                label="In Progress"
                colorClass="text-status-active"
                instances={grouped.inProgress}
              />
            )}
            {grouped.recentlyCompleted.length > 0 && (
              <PopoverSection
                label="Recently Done"
                colorClass="text-emerald-400"
                instances={grouped.recentlyCompleted}
                iconOverride={CheckCircle}
                dotColor="bg-emerald-400"
              />
            )}
            {grouped.waiting.length > 0 && (
              <PopoverSection
                label="Waiting"
                colorClass="text-status-idle"
                instances={grouped.waiting}
              />
            )}
            {grouped.stale.length > 0 && (
              <PopoverSection
                label="Stale"
                colorClass="text-text-tertiary"
                instances={grouped.stale}
                dotColor="bg-text-tertiary"
              />
            )}
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

function PopoverSection({
  label,
  colorClass,
  instances,
  iconOverride,
  dotColor
}: {
  label: string
  colorClass: string
  instances: ClaudeInstance[]
  iconOverride?: typeof Activity
  dotColor?: string
}) {
  return (
    <div>
      <div
        className={cn('px-4 py-1.5 text-[9px] font-semibold uppercase tracking-widest', colorClass)}
      >
        {label}
      </div>
      <div className="divide-y divide-border">
        {instances.map((inst) => (
          <PopoverInstanceRow
            key={inst.pid}
            instance={inst}
            iconOverride={iconOverride}
            dotColor={dotColor}
          />
        ))}
      </div>
    </div>
  )
}

function PopoverInstanceRow({
  instance,
  iconOverride,
  dotColor
}: {
  instance: ClaudeInstance
  iconOverride?: typeof Activity
  dotColor?: string
}) {
  const [elapsed, setElapsed] = useState(instance.elapsedSeconds)

  useEffect(() => {
    setElapsed(instance.elapsedSeconds)

    if (instance.status !== 'active' && instance.status !== 'idle' && instance.status !== 'stale')
      return

    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [instance.elapsedSeconds, instance.status, instance.pid])

  const StatusIcon = iconOverride ?? statusIcons[instance.status]
  const resolvedDotColor = dotColor ?? statusColors[instance.status]

  const idleAgo =
    instance.lastBecameIdleAt && instance.status === 'idle'
      ? timeAgo(new Date(instance.lastBecameIdleAt))
      : null

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      {/* Status dot */}
      <span
        className={cn(
          'inline-block h-2 w-2 shrink-0 rounded-full',
          resolvedDotColor,
          instance.status === 'active' && !dotColor && 'animate-pulse-dot'
        )}
      />

      {/* Project name + metrics */}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-text-primary">
          {instance.projectName}
        </span>
        <div className="mt-0.5 flex items-center gap-3 text-[10px] text-text-tertiary">
          <span className="tabular-nums">{idleAgo ?? formatElapsedTime(elapsed)}</span>
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
          'text-emerald-400': !!iconOverride,
          'text-status-active': !iconOverride && instance.status === 'active',
          'text-status-idle': !iconOverride && instance.status === 'idle',
          'text-text-tertiary': !iconOverride && instance.status === 'stale',
          'text-status-exited': !iconOverride && instance.status === 'exited'
        })}
        aria-label={instance.status}
      />
    </div>
  )
}

function PopoverWeeklyBar({
  weeklyTokens,
  weeklyTokenTarget
}: {
  weeklyTokens: number
  weeklyTokenTarget: number
}) {
  const percent = Math.min(100, (weeklyTokens / weeklyTokenTarget) * 100)
  const barColor =
    percent >= 80 ? 'bg-red-400' : percent >= 60 ? 'bg-amber-400' : 'bg-status-active'

  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-border">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${percent}%` }}
          role="progressbar"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Weekly token usage"
        />
      </div>
      <span className="shrink-0 text-[10px] tabular-nums text-text-tertiary">
        {formatCompactNumber(weeklyTokens)}/{formatCompactNumber(weeklyTokenTarget)}
      </span>
    </div>
  )
}

function rateLimitBarColor(percent: number): string {
  if (percent >= 80) return 'bg-red-400'
  if (percent >= 50) return 'bg-amber-400'
  return 'bg-status-active'
}

function rateLimitTextColor(percent: number): string {
  if (percent >= 80) return 'text-red-400'
  if (percent >= 50) return 'text-amber-400'
  return 'text-text-tertiary'
}

function PopoverRateLimitBars({ rateLimits }: { rateLimits: RateLimits }) {
  if (rateLimits.isVeryStale) return null

  return (
    <div
      className={cn(
        'mt-1.5 flex flex-col gap-1.5 text-[10px] tabular-nums',
        rateLimits.isStale && 'opacity-60'
      )}
    >
      <PopoverMiniBar label="5h" percent={rateLimits.window_5h.used_percentage} />
      <PopoverMiniBar label="7d" percent={rateLimits.window_7d.used_percentage} />
    </div>
  )
}

function PopoverMiniBar({ label, percent: raw }: { label: string; percent: number }) {
  const percent = Math.round(Math.min(100, raw))
  return (
    <div className="flex items-center gap-2">
      <span className={cn('w-5 shrink-0', rateLimitTextColor(percent))}>{label}</span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-border">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            rateLimitBarColor(percent)
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className={cn('w-7 text-right', rateLimitTextColor(percent))}>{percent}%</span>
    </div>
  )
}
