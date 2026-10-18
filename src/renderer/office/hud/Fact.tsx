import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface FactProps {
  term: string
  value: string
  // Tokens are the resource, so their number takes the lantern colour.
  isLantern?: boolean
  // A part of the fact above it.
  isNested?: boolean
  isWrapping?: boolean
  children?: ReactNode
}

// One row of the inspector's definition list.
export function Fact({
  term,
  value,
  isLantern = false,
  isNested = false,
  isWrapping = false,
  children
}: FactProps) {
  return (
    <>
      <dt className={cn('text-caption text-text-secondary', isNested && 'pl-3')}>{term}</dt>
      <dd
        className={cn(
          'min-w-0 tabular-nums',
          isNested ? 'text-xs text-text-secondary' : 'text-body',
          isLantern ? 'font-semibold text-accent' : !isNested && 'text-text-primary'
        )}
      >
        <span className={cn('block', isWrapping ? '[overflow-wrap:anywhere]' : 'truncate')}>
          {value}
        </span>
        {children}
      </dd>
    </>
  )
}
