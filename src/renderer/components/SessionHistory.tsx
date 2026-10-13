import { useState, useEffect } from 'react'
import { Trash2, FileText } from 'lucide-react'
import { deckApi } from '../deck/deck-api'
import { crestFor } from '../deck/roster'
import { formatElapsedTime, pathSegments, timeAgo } from '../lib/utils'
import type { SessionHistoryEntry } from '../lib/types'
import { BUTTON_QUIET_COMPACT_CLASS } from './deck/deck-styles'
import { Crest } from './deck/Plate'

export function SessionHistory() {
  const [history, setHistory] = useState<SessionHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [isConfirmingClear, setIsConfirmingClear] = useState(false)

  useEffect(() => {
    const api = deckApi()
    if (!api) {
      setLoading(false)
      return
    }

    api
      .getHistory()
      .then((entries) => setHistory(entries ?? []))
      .finally(() => setLoading(false))
  }, [])

  const handleClear = async () => {
    const api = deckApi()
    if (!api) return
    await api.clearHistory()
    setHistory([])
    setIsConfirmingClear(false)
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="mr-auto pt-1 font-plate text-count">History</h1>
        {/* Clearing cannot be undone, so it takes a second, explicit click. */}
        {history.length > 0 && isConfirmingClear && (
          <>
            <span className="text-xs text-text-primary" role="status">
              Clear {history.length} {history.length === 1 ? 'session' : 'sessions'}?
            </span>
            <button type="button" onClick={handleClear} className={BUTTON_QUIET_COMPACT_CLASS}>
              Clear
            </button>
            <button
              type="button"
              onClick={() => setIsConfirmingClear(false)}
              className={BUTTON_QUIET_COMPACT_CLASS}
            >
              Keep
            </button>
          </>
        )}
        {history.length > 0 && !isConfirmingClear && (
          <button
            type="button"
            onClick={() => setIsConfirmingClear(true)}
            className={BUTTON_QUIET_COMPACT_CLASS}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Clear history
          </button>
        )}
      </div>

      {loading ? (
        <p className="py-10 text-center text-body text-text-secondary" role="status">
          Loading history…
        </p>
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-14 text-center" role="status">
          <FileText className="size-10 text-text-tertiary" aria-hidden="true" />
          <p className="text-body font-semibold text-text-secondary">No session history yet</p>
          <p className="text-xs text-text-tertiary">A session lands here when its agent exits.</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div
            aria-hidden="true"
            className="grid h-5 grid-cols-[22px_minmax(0,1fr)_80px_80px] items-center gap-2.5 px-2 text-caption text-text-tertiary"
          >
            <span className="col-span-2">Session</span>
            <span className="text-right">Ran for</span>
            <span className="text-right">Ended</span>
          </div>
          <ul aria-label="Session history entries">
            {history.map((entry) => {
              const projectLabel = pathSegments(entry.projectName).pop() ?? entry.projectName
              return (
                <li
                  key={`${entry.pid}-${String(entry.startedAt)}`}
                  className="grid h-8 grid-cols-[22px_minmax(0,1fr)_80px_80px] items-center gap-2.5 border-b border-border/40 px-2 text-body hover:bg-surface-raised"
                >
                  <Crest letters={crestFor(projectLabel)} />
                  <span className="truncate font-semibold" title={entry.projectPath}>
                    {entry.projectName}
                  </span>
                  <span className="text-right tabular-nums text-text-secondary">
                    {formatElapsedTime(entry.durationSeconds)}
                  </span>
                  <span className="text-right tabular-nums text-text-tertiary">
                    {timeAgo(new Date(entry.endedAt))}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
