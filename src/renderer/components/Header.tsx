import { useState, useEffect } from 'react'
import { LayoutDashboard, History, Settings } from 'lucide-react'
import { cn } from '../lib/utils'
import type { InstanceUpdate } from '../lib/types'

export type ViewType = 'dashboard' | 'history' | 'settings'

interface HeaderProps {
  currentView: ViewType
  onViewChange: (view: ViewType) => void
}

const navItems: { view: ViewType; label: string; icon: typeof LayoutDashboard }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { view: 'history', label: 'History', icon: History },
  { view: 'settings', label: 'Settings', icon: Settings }
]

const emptyStats: InstanceUpdate['stats'] = {
  total: 0,
  active: 0,
  idle: 0,
  stale: 0,
  exited: 0,
  recentlyCompleted: 0
}

export function Header({ currentView, onViewChange }: HeaderProps) {
  const [stats, setStats] = useState(emptyStats)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.api) return

    window.api.getInstances().then((data) => setStats(data.stats))

    const unsubscribe = window.api.onInstancesUpdate((data) => setStats(data.stats))
    return unsubscribe
  }, [])

  const hasActive = stats.active > 0

  return (
    <header
      className="drag-region flex h-12 shrink-0 items-center border-b border-border px-4"
      role="banner"
    >
      {/* macOS traffic light spacer — left */}
      <div className="w-[78px] shrink-0" aria-hidden="true" />

      {/* Centered nav pills */}
      <nav aria-label="Main navigation" className="flex flex-1 items-center justify-center">
        <div className="flex items-center gap-1 rounded-lg bg-surface-raised p-1">
          {navItems.map(({ view, label, icon: Icon }) => (
            <button
              key={view}
              type="button"
              onClick={() => onViewChange(view)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                currentView === view
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-secondary hover:text-text-primary'
              )}
              aria-current={currentView === view ? 'page' : undefined}
              aria-label={label}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Live status indicator — right */}
      <div
        className="flex w-[78px] shrink-0 items-center justify-end gap-2"
        role="status"
        aria-label={`${stats.active} active, ${stats.total} total instances`}
      >
        {stats.total > 0 ? (
          <>
            <span
              className={cn(
                'inline-block h-2 w-2 rounded-full',
                hasActive ? 'bg-status-active animate-pulse-dot' : 'bg-text-tertiary'
              )}
              aria-hidden="true"
            />
            <span className="text-mono-sm tabular-nums text-text-secondary">
              <span className={cn(hasActive ? 'text-status-active' : 'text-text-secondary')}>
                {stats.active}
              </span>
              <span className="text-text-tertiary">/{stats.total}</span>
            </span>
          </>
        ) : (
          <span className="text-mono-sm text-text-tertiary">—</span>
        )}
      </div>
    </header>
  )
}
