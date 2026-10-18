import { memo } from 'react'
import type { NewsItem } from '../logic/attention-queue'

// The line keeps its height when empty, so the header never jumps when news lands.
export const NEWS_LINE_HEIGHT_PX = 20

// The header's measured height includes the line under it, so cards and the inspector clear both.
export const headerWithNewsLine = (headerHeight: number): number =>
  headerHeight + NEWS_LINE_HEIGHT_PX

// The latest city event in words. Plain text: the status region already announces it, and a
// line that changes this often never animates or takes focus. It sits on the header's own
// surface: over the bare scene, a light city ground drops it far below 4.5:1.
export const NewsLine = memo(function NewsLine({ news }: { news: NewsItem | null }) {
  return (
    <div
      className="flex min-w-0 items-center justify-center border-b border-border bg-surface-rail px-3"
      style={{ height: NEWS_LINE_HEIGHT_PX }}
    >
      {news && <p className="min-w-0 truncate text-xs text-text-secondary">{news.text}</p>}
    </div>
  )
})
