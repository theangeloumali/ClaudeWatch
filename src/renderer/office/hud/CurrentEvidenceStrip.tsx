import { Plate } from '../../components/deck/Plate'
import { PLATE_TITLE_CLASS } from '../../components/deck/deck-styles'
import { cn } from '../../lib/utils'
import type { OfficeFeed, OfficeFrame } from '../scene-model'
import { LiveWork } from './LiveWork'
import { useState } from 'react'
import { BUTTON_QUIET_COMPACT_CLASS } from '../../components/deck/deck-styles'

export interface CurrentEvidenceStripProps {
  frame: OfficeFrame
  agentKey: string | null
  feed: OfficeFeed
}

// dry-new: the Inspector-only evidence needs a persistent, selection-owned footer.
export function CurrentEvidenceStrip({ frame, agentKey, feed }: CurrentEvidenceStripProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  return (
    <section aria-label="Current-session evidence" className="relative min-w-0">
      <Plate faceClassName="min-h-14 min-w-0 space-y-1 px-3 py-1 md:py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className={cn(PLATE_TITLE_CLASS, 'max-md:sr-only')}>Current-session evidence</h2>
          {agentKey && (
            <details
              onToggle={(event) => setIsExpanded(event.currentTarget.open)}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return
                event.currentTarget.open = false
                event.currentTarget.querySelector('summary')?.focus()
              }}
            >
              <summary className={`${BUTTON_QUIET_COMPACT_CLASS} cursor-pointer`}>
                Evidence details
              </summary>
              <div className="absolute bottom-full right-0 z-20 mb-2 max-h-[40vh] w-[min(720px,calc(100vw-24px))] overflow-y-auto rounded-md border border-border bg-surface-raised p-3 shadow-lg">
                {isExpanded && <LiveWork frame={frame} agentKey={agentKey} feed={feed} />}
              </div>
            </details>
          )}
        </div>
        {agentKey ? (
          <LiveWork frame={frame} agentKey={agentKey} feed={feed} presentation="strip" />
        ) : (
          <p className="flex min-h-11 items-center text-body text-text-secondary md:min-h-0">
            Select a worker to view current-session evidence.
          </p>
        )}
      </Plate>
    </section>
  )
}
