import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import type { SessionRef } from '../../../shared/office/types'
import type { NewsItem } from '../logic/attention-queue'
import { GLASS_CLASS, GLASS_META_CLASS, inkOn } from './glass'

export const MAX_TOASTS = 3
export const TOAST_LIFETIME_MS = 6_000

interface Toast {
  id: string
  title: string | null
  line: string
  chip: string | null
  atMs: number
}

export const toastAge = (ageMs: number): string =>
  ageMs < 60_000 ? 'now' : `${Math.floor(ageMs / 60_000)}m`

// News ids start with their session key (`key:done:…`, `key/permission/…`); hoists name none.
function sessionOf(id: string, sessions: readonly SessionRef[]): SessionRef | undefined {
  return sessions
    .filter((session) => id.startsWith(`${session.key}:`) || id.startsWith(`${session.key}/`))
    .sort((first, second) => second.key.length - first.key.length)[0]
}

function toastOf(
  news: NewsItem,
  sessions: readonly SessionRef[],
  chips: ReadonlyMap<string, string>
): Toast {
  const session = sessionOf(news.id, sessions)
  const prefix = session ? `${session.projectLabel} › ` : null
  const isSplit = prefix !== null && news.text.startsWith(prefix)
  return {
    id: news.id,
    title: isSplit && session ? session.projectLabel : null,
    line: isSplit && prefix ? news.text.slice(prefix.length) : news.text,
    chip: (session && chips.get(session.projectKey)) ?? null,
    atMs: Date.now()
  }
}

interface ToastStackProps {
  news: NewsItem | null
  sessions: readonly SessionRef[]
  // Room chip colour by project key.
  chips: ReadonlyMap<string, string>
}

// The Campus news: the same items the news line shows, as cards that leave on their own.
export function ToastStack({ news, sessions, chips }: ToastStackProps) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])
  // Keyed on the id alone: a frame that rewords nothing must not toast twice.
  const latest = useRef({ news, sessions, chips })
  latest.current = { news, sessions, chips }
  const newsId = news?.id
  useEffect(() => {
    const { news: item, sessions: named, chips: colours } = latest.current
    if (!item || timers.current.has(item.id)) return
    const toast = toastOf(item, named, colours)
    setToasts((current) => [toast, ...current].slice(0, MAX_TOASTS))
    const timer = setTimeout(() => {
      timers.current.delete(toast.id)
      setToasts((current) => current.filter((candidate) => candidate.id !== toast.id))
    }, TOAST_LIFETIME_MS)
    timers.current.set(toast.id, timer)
  }, [newsId])
  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Campus news"
      data-canvas-obstacle={toasts.length > 0 ? '' : undefined}
      className="pointer-events-none w-72 max-w-full"
    >
      <ul className="flex flex-col gap-2">
        {toasts.map((toast) => (
          <li key={toast.id} className={`${GLASS_CLASS} flex items-start gap-2.5 p-2.5`}>
            <span
              aria-hidden
              className="grid size-7 shrink-0 place-items-center rounded-md bg-white/10"
              style={toast.chip ? { backgroundColor: toast.chip } : undefined}
            >
              <Bell
                className="size-3.5"
                style={{ color: toast.chip ? inkOn(toast.chip) : '#ffffff' }}
                strokeWidth={2.5}
              />
            </span>
            <span className="min-w-0 flex-1">
              {toast.title && <strong className="block truncate text-xs">{toast.title}</strong>}
              <span className="block text-xs text-white/85 [overflow-wrap:anywhere]">
                {toast.line}
              </span>
            </span>
            <span className={`${GLASS_META_CLASS} shrink-0`}>
              {toastAge(Date.now() - toast.atMs)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
