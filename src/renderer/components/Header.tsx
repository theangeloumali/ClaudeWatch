import { Lamp } from 'lucide-react'
import { cn } from '../lib/utils'

export type ViewType = 'dashboard' | 'accounts' | 'history' | 'models' | 'settings'

interface HeaderProps {
  currentView: ViewType
  onViewChange: (view: ViewType) => void
}

const pages: { view: ViewType; label: string }[] = [
  { view: 'dashboard', label: 'Dashboard' },
  { view: 'accounts', label: 'Accounts' },
  { view: 'history', label: 'History' },
  { view: 'models', label: 'Models' },
  { view: 'settings', label: 'Settings' }
]

export function Header({ currentView, onViewChange }: HeaderProps) {
  const platform = window.api?.platform
  const isMac = platform === 'darwin'
  return (
    <header
      className={cn(
        'drag-region flex h-11 shrink-0 items-stretch gap-4 bg-surface-rail pr-3',
        !isMac && 'pl-4'
      )}
      role="banner"
    >
      {isMac && (
        <div data-testid="traffic-light-space" className="w-[78px] shrink-0" aria-hidden="true" />
      )}

      <div className="flex items-center gap-1.5 pt-[3px] font-plate text-[19px] font-bold leading-none">
        <Lamp className="-mt-[3px] size-4 text-gold" aria-hidden="true" />
        ClaudeWatch
      </div>

      <nav aria-label="Main navigation" className="flex items-stretch gap-0.5">
        {pages.map(({ view, label }) => {
          const isCurrent = currentView === view
          return (
            <button
              key={view}
              type="button"
              onClick={() => onViewChange(view)}
              aria-current={isCurrent ? 'page' : undefined}
              className={cn(
                'relative px-3 text-body transition-colors',
                isCurrent
                  ? 'font-semibold text-text-primary after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-brass'
                  : 'font-medium text-text-secondary hover:text-text-primary'
              )}
            >
              {label}
            </button>
          )
        })}
      </nav>

      {/* Three 46 px native caption buttons sit over this corner (titleBarOverlay). */}
      {platform === 'win32' && (
        <div
          data-testid="caption-button-space"
          className="ml-auto w-[138px] shrink-0"
          aria-hidden="true"
        />
      )}
    </header>
  )
}
