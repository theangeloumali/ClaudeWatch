import { Check, Circle, CircleDashed, Diamond, TriangleAlert } from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  ACTIVITY_SUMMARY_LABELS,
  ACTIVITY_UNAVAILABLE_LABEL,
  type ActivitySummary
} from '../logic/activity-summary'

// dry-new: StateMark represents one worker; these static counts share the same labels and tokens.
export function ActivityBreakdown({
  summary,
  className
}: {
  summary: ActivitySummary
  className?: string
}) {
  if (!summary.isAvailable) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
        <CircleDashed aria-hidden="true" className="size-3" />
        {ACTIVITY_UNAVAILABLE_LABEL}
      </span>
    )
  }
  const entries = [
    {
      count: summary.working,
      label: ACTIVITY_SUMMARY_LABELS.working,
      Icon: Circle,
      color: 'text-status-active'
    },
    {
      count: summary.needsYou,
      label: ACTIVITY_SUMMARY_LABELS.needsYou,
      Icon: Diamond,
      color: 'text-text-primary'
    },
    {
      count: summary.idleDone,
      label: ACTIVITY_SUMMARY_LABELS.idleDone,
      Icon: Check,
      color: 'text-text-secondary'
    }
  ]
  if (summary.issues > 0)
    entries.push({
      count: summary.issues,
      label: ACTIVITY_SUMMARY_LABELS.issues,
      Icon: TriangleAlert,
      color: 'text-accent-hot'
    })
  return (
    <span className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs', className)}>
      {entries.map(({ count, label, Icon, color }, index) => (
        <span key={label} className={cn('inline-flex items-center gap-1 whitespace-nowrap', color)}>
          {index > 0 && <span className="sr-only">, </span>}
          <Icon aria-hidden="true" className="size-3 shrink-0" />
          <strong className="tabular-nums">{count}</strong> {label}{' '}
        </span>
      ))}
    </span>
  )
}
