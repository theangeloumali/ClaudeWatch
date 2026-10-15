import { Bot, Gauge } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { Plate } from '../../components/deck/Plate'
import { cn } from '../../lib/utils'
import { COUNT_CLASS } from './hud-styles'
import { tokensText } from './tokens'
import type { ActivitySummary } from '../logic/activity-summary'
import { ActivityBreakdown } from './ActivityBreakdown'

interface ResourceBarProps {
  agentCount: number
  // Null until a session has been counted.
  tokens: number | null
  // A session is still being counted, so the total is a floor.
  isPartial: boolean
  activity: ActivitySummary
  presentation?: 'inline' | 'plate'
  onHeightChange?: (height: number) => void
}

// The office at a glance. Tokens are what live sessions have spent since they began.
export function ResourceBar({
  agentCount,
  tokens,
  isPartial,
  activity,
  presentation = 'plate',
  onHeightChange
}: ResourceBarProps) {
  const sectionRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const section = sectionRef.current
    if (!section || !onHeightChange) return
    const measure = (): void => onHeightChange(section.getBoundingClientRect().height)
    measure()
    if (typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(measure)
    observer.observe(section)
    return () => observer.disconnect()
  }, [onHeightChange])
  return (
    <section
      ref={sectionRef}
      aria-label="Office totals"
      className={cn(
        'min-w-0 max-w-full',
        presentation === 'plate' &&
          'max-md:fixed max-md:inset-x-3 max-md:top-[var(--office-summary-top,12px)] max-md:z-20'
      )}
    >
      {presentation === 'inline' ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
          <span className="font-semibold">Office-wide</span>
          <ResourceTotals agentCount={agentCount} tokens={tokens} isPartial={isPartial} />
          <ActivityBreakdown summary={activity} />
        </div>
      ) : (
        <Plate faceClassName="flex flex-col gap-2 px-3 py-2 text-xs text-text-secondary">
          <ActivityBreakdown summary={activity} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <ResourceTotals agentCount={agentCount} tokens={tokens} isPartial={isPartial} />
          </div>
        </Plate>
      )}
    </section>
  )
}

function ResourceTotals({
  agentCount,
  tokens,
  isPartial
}: Pick<ResourceBarProps, 'agentCount' | 'tokens' | 'isPartial'>) {
  return (
    <>
      <p className="flex items-center gap-1.5 whitespace-nowrap">
        <Bot aria-hidden="true" className="size-4" />
        <span>
          <strong className={cn(COUNT_CLASS, 'text-text-primary')}>{agentCount}</strong>{' '}
          {agentCount === 1 ? 'agent' : 'agents'}
        </span>
      </p>
      <p className="flex items-center gap-1.5 whitespace-nowrap">
        <Gauge aria-hidden="true" className="size-4 text-accent" />
        {tokens === null ? (
          <span>Tokens: {tokensText(tokens)}</span>
        ) : (
          <span>
            <strong className={cn(COUNT_CLASS, 'text-accent')}>
              {tokensText(tokens, isPartial)}
            </strong>{' '}
            tokens
          </span>
        )}
      </p>
    </>
  )
}
