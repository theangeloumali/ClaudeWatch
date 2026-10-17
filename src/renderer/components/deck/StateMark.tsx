import {
  Check,
  Circle,
  CircleDashed,
  CircleSlash,
  Diamond,
  Hourglass,
  TriangleAlert,
  type LucideIcon
} from 'lucide-react'
import type { AgentState } from '../../deck/roster'
import { cn } from '../../lib/utils'

interface StateSpec {
  label: string
  Icon: LucideIcon
  iconClassName: string
  labelClassName: string
}

// Every state is a shape plus a word, so colour is never the only cue.
const STATE_SPECS: Record<AgentState, StateSpec> = {
  'needs-you': {
    label: 'Needs you',
    Icon: Diamond,
    iconClassName: 'fill-seal stroke-paper',
    labelClassName: 'font-semibold text-text-primary'
  },
  error: {
    label: 'Error',
    Icon: TriangleAlert,
    iconClassName: '',
    labelClassName: 'text-accent-hot'
  },
  limited: {
    label: 'Rate limited',
    Icon: Hourglass,
    iconClassName: '',
    labelClassName: 'text-text-secondary'
  },
  working: {
    label: 'Working',
    Icon: Circle,
    iconClassName: 'fill-current text-status-active animate-pulse-dot',
    labelClassName: 'text-status-active'
  },
  done: {
    label: 'Done',
    Icon: Check,
    iconClassName: '',
    labelClassName: 'text-text-secondary'
  },
  idle: {
    label: 'Idle',
    Icon: Circle,
    iconClassName: '',
    labelClassName: 'text-text-tertiary'
  },
  stale: {
    label: 'Stale',
    Icon: CircleDashed,
    iconClassName: '',
    labelClassName: 'text-text-tertiary'
  },
  exited: {
    label: 'Exited',
    Icon: CircleSlash,
    iconClassName: '',
    labelClassName: 'text-text-tertiary'
  }
}

export function StateIcon({ state, className }: { state: AgentState; className?: string }) {
  const { Icon, iconClassName } = STATE_SPECS[state]
  return <Icon aria-hidden="true" className={cn('size-3 shrink-0', iconClassName, className)} />
}

export function StateMark({ state, detail }: { state: AgentState; detail?: string | null }) {
  const spec = STATE_SPECS[state]
  // A waiting agent states its reason outright; "Needs you" plus the reason does not fit a row.
  const isReasonShown = state === 'needs-you' && Boolean(detail)
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap',
        spec.labelClassName
      )}
    >
      <StateIcon state={state} />
      <span className="truncate">{isReasonShown ? detail : spec.label}</span>
      {detail && !isReasonShown && (
        <span className="truncate font-normal text-text-tertiary">{detail}</span>
      )}
    </span>
  )
}
