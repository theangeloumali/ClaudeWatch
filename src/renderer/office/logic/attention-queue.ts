import { needsHuman, type HumanAttention } from '../../../shared/office/attention'
import type { SessionRef } from '../../../shared/office/types'
import type { CityEvent, CityEventKind } from '../../office-live/city-events'
import { formatTokens, sessionTokens } from '../../deck/tokens'
import { GEM_SPECS } from './status-gem'
import { milestoneAmount, milestoneStep } from './token-spires'

export interface AttentionItem {
  sessionKey: string
  attention: HumanAttention
  sessionName: string
  projectLabel: string
  companyLabel: string
  sinceMs: number
}

function isQueued(session: SessionRef): session is SessionRef & { attention: HumanAttention } {
  return needsHuman(session.attention)
}

// Only "needs you" states queue (research §14); error and limited are counts, not queue items.
// updatedAtMs stands in for "waiting since": a session blocked on the human does not update.
export function buildAttentionQueue(sessions: readonly SessionRef[]): AttentionItem[] {
  return sessions
    .filter(isQueued)
    .map((session) => ({
      sessionKey: session.key,
      attention: session.attention,
      sessionName: session.name,
      projectLabel: session.projectLabel,
      companyLabel: session.companyLabel,
      sinceMs: session.updatedAtMs
    }))
    .sort((a, b) => a.sinceMs - b.sinceMs || a.sessionKey.localeCompare(b.sessionKey))
}

export function nextAttentionKey(
  queue: readonly AttentionItem[],
  currentKey: string | null
): string | null {
  if (queue.length === 0) return null
  const index = queue.findIndex((item) => item.sessionKey === currentKey)
  return queue[(index + 1) % queue.length].sessionKey
}

export function newAttentionItems(
  previous: readonly AttentionItem[],
  current: readonly AttentionItem[]
): AttentionItem[] {
  const seen = new Set(previous.map((item) => `${item.sessionKey}/${item.attention}`))
  return current.filter((item) => !seen.has(`${item.sessionKey}/${item.attention}`))
}

// One line of city news; `id` tells a new line from the same one shown again.
export interface NewsItem {
  id: string
  text: string
}

// A tool call has no words: one fires every few seconds per agent, too many to read.
const EVENT_WORDS: Record<CityEventKind, ((session: SessionRef) => string | null) | null> = {
  milestone: (session) => {
    const step = milestoneStep(sessionTokens(session.usage))
    return step > 0 ? `reached ${formatTokens(milestoneAmount(step))} tokens` : null
  },
  done: () => 'finished its turn',
  hoist: () => 'built a new spire stage',
  dispatch: null
}

const newsText = (session: Pick<AttentionItem, 'projectLabel' | 'sessionName'>, words: string) =>
  `${session.projectLabel} › ${session.sessionName} · ${words}`

// Words only: the session is named by the labels the HUD shows, never its key.
export function cityEventNews(event: CityEvent, sessions: readonly SessionRef[]): NewsItem | null {
  const session = sessions.find((candidate) => candidate.key === event.sessionKey)
  const words = session && EVENT_WORDS[event.kind]?.(session)
  if (!session || !words) return null
  const named = { projectLabel: session.projectLabel, sessionName: session.name }
  return { id: event.id, text: newsText(named, words) }
}

export function queueNews(item: AttentionItem): NewsItem {
  return {
    id: `${item.sessionKey}/${item.attention}/${item.sinceMs}`,
    text: newsText(item, GEM_SPECS[item.attention].label.toLowerCase())
  }
}
