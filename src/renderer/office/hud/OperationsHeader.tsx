import { Bot, Circle, CircleDashed, List } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { PLATE_TITLE_CLASS } from '../../components/deck/deck-styles'
import { cn } from '../../lib/utils'
import type { ActivitySummary } from '../logic/activity-summary'
import type { OperationsOffice } from '../logic/operations-model'
import { FIELD_CLASS, ROW_CLASS } from './hud-styles'
import { ResourceBar } from './ResourceBar'
import { tokensText } from './tokens'

export interface OperationsHeaderProps {
  offices: readonly OperationsOffice[]
  focusedFloorId: string | null
  isCityView: boolean
  agentCount: number
  tokens: number | null
  isPartial: boolean
  activity: ActivitySummary
  isConnected: boolean
  isListView: boolean
  hasHiddenTitleBar?: boolean
  onChooseFloor: (floorId: string | null) => void
  onToggleList: () => void
  onHeightChange?: (height: number) => void
}

// dry-new: ResourceBar has totals but no operational identity or shared scope selector.
export function OperationsHeader({
  offices,
  focusedFloorId,
  isCityView,
  agentCount,
  tokens,
  isPartial,
  activity,
  isConnected,
  isListView,
  hasHiddenTitleBar = false,
  onChooseFloor,
  onToggleList,
  onHeightChange
}: OperationsHeaderProps) {
  const headerRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const header = headerRef.current
    if (!header || !onHeightChange) return
    const measure = (): void => onHeightChange(header.getBoundingClientRect().height)
    measure()
    if (typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(measure)
    observer.observe(header)
    return () => observer.disconnect()
  }, [onHeightChange])
  const ConnectionIcon = isConnected ? Circle : CircleDashed
  return (
    <header
      ref={headerRef}
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 border-b border-border bg-surface-rail px-3 text-text-primary [-webkit-app-region:no-drag] min-[1100px]:flex"
    >
      <div
        className={cn(
          'flex min-h-14 min-w-0 items-center gap-2 min-[1100px]:shrink-0',
          hasHiddenTitleBar && '[-webkit-app-region:drag]'
        )}
      >
        {hasHiddenTitleBar && (
          <span
            aria-hidden="true"
            className="w-20 shrink-0 self-stretch [-webkit-app-region:no-drag]"
          />
        )}
        <Bot aria-hidden="true" className="size-4 shrink-0 text-accent" />
        <span className={cn(PLATE_TITLE_CLASS, 'truncate')} title="ClaudeWatch Office">
          Office
        </span>
      </div>
      <div className="col-span-3 row-start-2 min-w-0 border-t border-border py-0 min-[1100px]:order-none min-[1100px]:w-56 min-[1100px]:shrink-0 min-[1100px]:border-0">
        <select
          aria-label="Choose office or physical floor"
          value={isCityView ? '' : (focusedFloorId ?? '')}
          onChange={(event) => onChooseFloor(event.currentTarget.value || null)}
          className={cn(
            FIELD_CLASS,
            'h-11 w-full min-w-0 cursor-pointer [-webkit-app-region:no-drag]'
          )}
        >
          <optgroup
            label={`Office-wide: ${agentCount} agents · ${tokensText(tokens, isPartial)} tokens`}
          >
            <option value="">All offices</option>
            {offices.map((office) => (
              <option key={office.floor.floorId} value={office.floor.floorId}>
                {office.floor.label}
                {office.projectLabels.length > 0 ? ` · ${office.projectLabels.join(', ')}` : ''}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      <div className="hidden min-w-0 flex-1 min-[1100px]:block">
        <ResourceBar
          agentCount={agentCount}
          tokens={tokens}
          isPartial={isPartial}
          activity={activity}
          presentation="inline"
        />
      </div>
      <p className="flex shrink-0 items-center gap-1.5 text-xs text-text-secondary">
        <ConnectionIcon
          aria-hidden="true"
          className={cn('size-3', isConnected && 'text-status-active')}
        />
        {isConnected ? 'Connected' : 'Disconnected'}
      </p>
      <button
        type="button"
        aria-pressed={isListView}
        onClick={onToggleList}
        className={cn(
          ROW_CLASS,
          'shrink-0 justify-center text-body text-text-primary [-webkit-app-region:no-drag]'
        )}
        style={{ height: 44, minWidth: 64 }}
      >
        <List aria-hidden="true" className="size-4" /> List
      </button>
    </header>
  )
}
