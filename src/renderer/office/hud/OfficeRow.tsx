import { ChevronDown, Diamond } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { agentCountLabel, needsYouLabel } from '../logic/floor-model'
import type { OfficeProjectRow } from '../logic/zone-model'
import type { OfficeTheme } from '../themes/types'
import { ROW_CLASS } from './hud-styles'
import { formatTotal } from '../../deck/tokens'
import { summariseActivity, type ActivitySummary } from '../logic/activity-summary'
import { ActivityBreakdown } from './ActivityBreakdown'

type RowCounts = Pick<OfficeProjectRow, 'label' | 'zoneId' | 'agentCount' | 'attentionCount'>

function rowName(row: RowCounts, tokens: number | undefined, isPartial: boolean): string {
  const waiting = row.attentionCount > 0 ? `, ${needsYouLabel(row.attentionCount)}` : ''
  const floor = isPartial ? ' or more' : ''
  const spent = tokens === undefined ? '' : `, ${formatTotal(tokens, false)}${floor} tokens`
  return `${row.label}, ${agentCountLabel(row.agentCount)}${waiting}${spent}`
}

interface ZoneButtonProps {
  row: RowCounts
  // Absent until one of the zone's sessions has been counted.
  tokens: number | undefined
  // A session under this zone is still being counted, so the total is a floor.
  isPartial: boolean
  focusedZoneId: string | null
  onFlyToZone: (zoneId: string) => void
  // The zone's name, set in the face its level uses.
  children: ReactNode
  activity?: ActivitySummary
}

// Flies the camera to a company or project. A row without a zone yet is shown, not clickable.
export function ZoneButton({
  row,
  tokens,
  isPartial,
  focusedZoneId,
  onFlyToZone,
  children,
  activity
}: ZoneButtonProps) {
  const isCurrent = row.zoneId !== null && row.zoneId === focusedZoneId
  const descriptionId = useId()
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2">
        <button
          type="button"
          aria-label={rowName(row, tokens, isPartial)}
          aria-describedby={descriptionId}
          aria-current={isCurrent ? 'true' : undefined}
          disabled={row.zoneId === null}
          onClick={() => row.zoneId && onFlyToZone(row.zoneId)}
          className={`${ROW_CLASS} col-span-2 col-start-1 row-start-1 grid grid-cols-subgrid`}
        >
          {children}
        </button>
        <span
          aria-hidden="true"
          className="pointer-events-none col-start-2 row-start-1 flex items-center gap-2 px-1.5"
        >
          {row.attentionCount > 0 && (
            <span className="flex items-center gap-0.5 text-xs font-semibold text-text-primary">
              <Diamond aria-hidden="true" className="size-3 fill-seal stroke-paper" />
              {row.attentionCount}
            </span>
          )}
          <span className="text-caption tabular-nums text-text-tertiary">{row.agentCount}</span>
          {tokens !== undefined && (
            <span className="min-w-[2.75rem] text-right text-xs tabular-nums text-accent">
              {formatTotal(tokens, isPartial)}
            </span>
          )}
        </span>
      </div>
      <span id={descriptionId} className="px-1.5 pb-1">
        <ActivityBreakdown summary={activity ?? summariseActivity([], false)} />
      </span>
    </div>
  )
}

interface ThemeToggleProps {
  zoneLabel: string
  theme: OfficeTheme
  isOpen: boolean
  onToggle: () => void
  buttonRef: (element: HTMLButtonElement | null) => void
}

// A theme's own lacquer and gold. Decoration only: the name is always written beside it.
export function ThemeSwatch({ theme }: { theme: OfficeTheme }) {
  return (
    <span
      aria-hidden="true"
      className="size-3 shrink-0 rounded-sm ring-1 ring-border-strong"
      style={{
        background: `linear-gradient(135deg, ${theme.palette.lacquer} 50%, ${theme.palette.gold} 50%)`
      }}
    />
  )
}

const THEME_TOGGLE_CLASS =
  'ml-1.5 flex min-h-[24px] items-center gap-1.5 self-start rounded-md px-1.5 text-caption text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary'

// Sits under its row, so the theme's name is read without a tooltip.
export function ThemeToggle({ zoneLabel, theme, isOpen, onToggle, buttonRef }: ThemeToggleProps) {
  return (
    <button
      type="button"
      ref={buttonRef}
      aria-label={`Theme for ${zoneLabel}: ${theme.label}`}
      aria-expanded={isOpen}
      onClick={onToggle}
      className={THEME_TOGGLE_CLASS}
    >
      <ThemeSwatch theme={theme} />
      {theme.label}
      <ChevronDown aria-hidden="true" className="size-3" />
    </button>
  )
}
