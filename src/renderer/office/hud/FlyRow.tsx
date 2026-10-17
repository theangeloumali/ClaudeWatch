import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

const FLY_ROW_CLASS =
  'flex min-h-11 w-full min-w-0 touch-manipulation flex-col justify-center rounded-md px-1.5 text-left'

interface FlyRowProps {
  // Absent while the office has no zone: the row is then text, never a dead button.
  zoneId: string | null | undefined
  onFlyToZone: (zoneId: string) => void
  // Spacing only; the row's shape is shared.
  className: string
  children: ReactNode
}

// A HUD row that flies to its office, as the Offices panel does. Only a tappable row lights on
// hover, so plain text never suggests a tap.
export function FlyRow({ zoneId, onFlyToZone, className, children }: FlyRowProps) {
  if (!zoneId) return <div className={cn(FLY_ROW_CLASS, className)}>{children}</div>
  return (
    <button
      type="button"
      className={cn(FLY_ROW_CLASS, 'transition-colors hover:bg-surface-hover', className)}
      onClick={() => onFlyToZone(zoneId)}
    >
      {children}
    </button>
  )
}
