import {
  Search,
  Activity,
  Moon,
  XCircle,
  Layers,
  DollarSign,
  ArrowRight,
  ArrowLeft,
  Zap,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle
} from 'lucide-react'
import { cn, formatCompactNumber, formatCurrency, formatCountdown, timeAgo } from '../lib/utils'
import { useInstances, type StatusFilter } from '../hooks/useInstances'
import { useUsage } from '../hooks/useUsage'
import { usePromoStatus } from '../hooks/usePromoStatus'
import { InstanceList } from './InstanceList'
import type { ClaudeInstance } from '../lib/types'

const filterButtons: { filter: StatusFilter; label: string }[] = [
  { filter: 'all', label: 'All' },
  { filter: 'active', label: 'Active' },
  { filter: 'idle', label: 'Idle' },
  { filter: 'exited', label: 'Exited' }
]

const statusBorderColors: Record<string, string> = {
  total: 'border-l-accent',
  active: 'border-l-status-active',
  idle: 'border-l-status-idle',
  exited: 'border-l-status-exited',
  recentlyCompleted: 'border-l-emerald-400'
}

const statCards: {
  key: keyof ReturnType<typeof useInstances>['stats']
  label: string
  icon: typeof Activity
  colorClass: string
}[] = [
  {
    key: 'total',
    label: 'Total',
    icon: Layers,
    colorClass: 'text-accent'
  },
  {
    key: 'active',
    label: 'Active',
    icon: Activity,
    colorClass: 'text-status-active'
  },
  {
    key: 'recentlyCompleted',
    label: 'Completed',
    icon: CheckCircle,
    colorClass: 'text-emerald-400'
  },
  {
    key: 'idle',
    label: 'Idle',
    icon: Moon,
    colorClass: 'text-status-idle'
  },
  {
    key: 'exited',
    label: 'Exited',
    icon: XCircle,
    colorClass: 'text-status-exited'
  }
]

export function Dashboard() {
  const {
    stats,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    filteredInstances,
    groupedInstances
  } = useInstances()
  const { usage, showModelBreakdown, setShowModelBreakdown } = useUsage()
  const { promo } = usePromoStatus()

  const showGrouped = filter === 'all'

  return (
    <div className="no-drag flex h-full min-h-0 flex-col overflow-hidden p-5">
      <div className="no-drag min-h-0 flex-1 overflow-y-auto" data-testid="dashboard-scroll-region">
        <div className="flex min-h-full flex-col gap-5 pr-1">
          {/* Promo banner */}
          {promo?.promoActive && <PromoBanner promo={promo} />}

          {/* Instance stats row */}
          <div>
            <div
              className="mb-2 text-caption uppercase tracking-wider text-text-tertiary"
              aria-hidden="true"
            >
              Instances
            </div>
            <div className="grid grid-cols-5 gap-3" role="region" aria-label="Instance statistics">
              {statCards.map(({ key, label, icon: Icon, colorClass }) => (
                <div key={key} className={cn('stat-card border-l-2', statusBorderColors[key])}>
                  <div className="flex items-center gap-1.5">
                    <Icon className={cn('h-3.5 w-3.5', colorClass)} aria-hidden="true" />
                    <span className="text-caption uppercase tracking-wider text-text-secondary">
                      {label}
                    </span>
                  </div>
                  <span
                    className="text-stat tabular-nums text-text-primary"
                    aria-label={`${label}: ${stats[key]}`}
                  >
                    {stats[key]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Usage stats row */}
          <UsageSection
            usage={usage}
            showModelBreakdown={showModelBreakdown}
            onToggleBreakdown={() => setShowModelBreakdown(!showModelBreakdown)}
          />

          {/* Filter bar */}
          <div className="flex items-center gap-2">
            <div
              className="flex gap-1 rounded-full bg-surface-raised p-1"
              role="group"
              aria-label="Filter by status"
            >
              {filterButtons.map(({ filter: f, label }) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={cn(filter === f ? 'filter-btn-active' : 'filter-btn')}
                  aria-pressed={filter === f}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relative ml-auto">
              <Search
                className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary"
                aria-hidden="true"
              />
              <input
                type="search"
                placeholder="Search instances..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-64 rounded-card border border-border bg-surface-raised pl-8 pr-3 text-xs text-text-primary placeholder:text-text-tertiary focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent-ring"
                aria-label="Search instances"
              />
            </div>
          </div>

          {/* Instance list */}
          {showGrouped ? (
            <GroupedInstanceList
              recentlyCompleted={groupedInstances.recentlyCompleted}
              inProgress={groupedInstances.inProgress}
              waiting={groupedInstances.waiting}
              stale={groupedInstances.stale}
            />
          ) : (
            <InstanceList instances={filteredInstances} />
          )}
        </div>
      </div>
    </div>
  )
}

function GroupedInstanceList({
  recentlyCompleted,
  inProgress,
  waiting,
  stale
}: {
  recentlyCompleted: ClaudeInstance[]
  inProgress: ClaudeInstance[]
  waiting: ClaudeInstance[]
  stale: ClaudeInstance[]
}) {
  const hasAny =
    recentlyCompleted.length > 0 || inProgress.length > 0 || waiting.length > 0 || stale.length > 0

  if (!hasAny) {
    return <InstanceList instances={[]} />
  }

  return (
    <div className="flex flex-col gap-4">
      {inProgress.length > 0 && (
        <InstanceSection
          label="In Progress"
          icon={<Activity className="h-3 w-3 animate-pulse" aria-hidden="true" />}
          colorClass="text-status-active"
          borderClass="border-l-status-active"
          instances={inProgress}
        />
      )}
      {recentlyCompleted.length > 0 && (
        <InstanceSection
          label="Recently Completed"
          icon={<CheckCircle className="h-3 w-3" aria-hidden="true" />}
          colorClass="text-emerald-400"
          borderClass="border-l-emerald-400"
          instances={recentlyCompleted}
          showTimeAgo
        />
      )}
      {waiting.length > 0 && (
        <InstanceSection
          label="Waiting"
          icon={<Moon className="h-3 w-3" aria-hidden="true" />}
          colorClass="text-status-idle"
          borderClass="border-l-status-idle"
          instances={waiting}
        />
      )}
      {stale.length > 0 && (
        <InstanceSection
          label="Stale"
          icon={<Moon className="h-3 w-3 opacity-50" aria-hidden="true" />}
          colorClass="text-text-tertiary"
          borderClass="border-l-border"
          instances={stale}
        />
      )}
    </div>
  )
}

function InstanceSection({
  label,
  icon,
  colorClass,
  instances,
  showTimeAgo: _showTimeAgo
}: {
  label: string
  icon: React.ReactNode
  colorClass: string
  borderClass: string
  instances: ClaudeInstance[]
  showTimeAgo?: boolean
}) {
  return (
    <div>
      <div
        className={cn(
          'mb-2 flex items-center gap-1.5 text-caption uppercase tracking-wider',
          colorClass
        )}
      >
        {icon}
        <span>{label}</span>
        <span className="text-text-tertiary">({instances.length})</span>
      </div>
      <InstanceList instances={instances} />
    </div>
  )
}

function PromoBanner({
  promo
}: {
  promo: NonNullable<ReturnType<typeof usePromoStatus>['promo']>
}) {
  if (promo.is2x) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg bg-status-active/15 px-4 py-2.5 text-xs"
        role="status"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-active opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-status-active" />
        </span>
        <span className="font-semibold text-status-active">2x ACTIVE</span>
        <span className="text-text-secondary">&middot;</span>
        {promo.expiresInSeconds != null && (
          <>
            <span className="text-text-secondary">
              expires in {formatCountdown(promo.expiresInSeconds)}
            </span>
            <span className="text-text-secondary">&middot;</span>
          </>
        )}
        <span className="text-text-tertiary">{promo.promoPeriod} promo</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface-raised px-4 py-2.5 text-xs">
      <span className="inline-block h-2 w-2 rounded-full bg-text-tertiary" />
      <span className="font-medium text-text-secondary">1x Standard</span>
      <span className="text-text-tertiary">&middot;</span>
      {promo.nextWindowStart && (
        <>
          <span className="text-text-tertiary">2x resumes at {promo.nextWindowStart}</span>
          <span className="text-text-tertiary">&middot;</span>
        </>
      )}
      <span className="text-text-tertiary">{promo.promoPeriod} promo</span>
    </div>
  )
}

function UsageSection({
  usage,
  showModelBreakdown,
  onToggleBreakdown
}: {
  usage: ReturnType<typeof useUsage>['usage']
  showModelBreakdown: boolean
  onToggleBreakdown: () => void
}) {
  if (!usage) return null

  if (!usage.dataAvailable) {
    return (
      <div>
        <div
          className="mb-2 text-caption uppercase tracking-wider text-text-tertiary"
          aria-hidden="true"
        >
          Usage
        </div>
        <div className="stat-card border-l-2 border-l-text-tertiary">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-text-tertiary" aria-hidden="true" />
            <span className="text-xs text-text-tertiary">Claude Code usage data not found</span>
          </div>
        </div>
      </div>
    )
  }

  const usageCards = [
    {
      label: 'Cost',
      value: formatCurrency(usage.totalCostUSD),
      icon: DollarSign,
      colorClass: 'text-status-active',
      borderClass: 'border-l-status-active'
    },
    {
      label: 'Input',
      value: formatCompactNumber(usage.totalInputTokens),
      icon: ArrowRight,
      colorClass: 'text-cyan-400',
      borderClass: 'border-l-cyan-400'
    },
    {
      label: 'Output',
      value: formatCompactNumber(usage.totalOutputTokens),
      icon: ArrowLeft,
      colorClass: 'text-purple-400',
      borderClass: 'border-l-purple-400'
    },
    {
      label: 'Cache',
      value: formatCompactNumber(usage.totalCacheReadTokens),
      icon: Zap,
      colorClass: 'text-amber-400',
      borderClass: 'border-l-amber-400'
    }
  ]

  const ToggleIcon = showModelBreakdown ? ChevronUp : ChevronDown

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-caption uppercase tracking-wider text-text-tertiary">Usage</span>
        {usage.modelUsage.length > 0 && (
          <button
            type="button"
            onClick={onToggleBreakdown}
            className="flex items-center gap-1 text-caption text-text-tertiary transition-colors hover:text-text-secondary"
            aria-expanded={showModelBreakdown}
          >
            Models
            <ToggleIcon className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3" role="region" aria-label="Usage statistics">
        {usageCards.map(({ label, value, icon: Icon, colorClass, borderClass }) => (
          <div key={label} className={cn('stat-card border-l-2', borderClass)}>
            <div className="flex items-center gap-1.5">
              <Icon className={cn('h-3.5 w-3.5', colorClass)} aria-hidden="true" />
              <span className="text-caption uppercase tracking-wider text-text-secondary">
                {label}
              </span>
            </div>
            <span className="text-stat tabular-nums text-text-primary">{value}</span>
          </div>
        ))}
      </div>

      {/* Weekly token progress bar */}
      <WeeklyTokenBar
        weeklyTokens={usage.weeklyTokens}
        weeklyTokenTarget={usage.weeklyTokenTarget}
      />

      {/* Per-model breakdown */}
      {showModelBreakdown && usage.modelUsage.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-lg border border-border bg-surface-raised">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-caption uppercase tracking-wider text-text-tertiary">
                <th className="px-3 py-2 font-medium">Model</th>
                <th className="px-3 py-2 text-right font-medium">Input</th>
                <th className="px-3 py-2 text-right font-medium">Output</th>
                <th className="px-3 py-2 text-right font-medium">Cache</th>
                <th className="px-3 py-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {usage.modelUsage.map((m) => (
                <tr key={m.model} className="text-text-primary">
                  <td className="px-3 py-2 font-mono text-[11px]">{m.model}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCompactNumber(m.inputTokens)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCompactNumber(m.outputTokens)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCompactNumber(m.cacheReadInputTokens)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(m.costUSD)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function WeeklyTokenBar({
  weeklyTokens,
  weeklyTokenTarget
}: {
  weeklyTokens: number
  weeklyTokenTarget: number
}) {
  if (!weeklyTokenTarget) return null

  const percent = Math.min(100, (weeklyTokens / weeklyTokenTarget) * 100)
  const barColor =
    percent >= 80 ? 'bg-red-400' : percent >= 60 ? 'bg-amber-400' : 'bg-status-active'
  const textColor =
    percent >= 80 ? 'text-red-400' : percent >= 60 ? 'text-amber-400' : 'text-status-active'

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-text-tertiary">Weekly tokens</span>
        <span className={cn('tabular-nums', textColor)}>
          {formatCompactNumber(weeklyTokens)} / {formatCompactNumber(weeklyTokenTarget)} (
          {Math.round(percent)}%)
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
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
    </div>
  )
}
