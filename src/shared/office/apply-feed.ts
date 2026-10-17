import type { FeedMessage, OfficeSnapshot } from './types'

// Folds the bridge's feed into the latest snapshot. Returns null when there is no
// trustworthy state (before the first hello, or after a resync request).
export function applyFeed(
  current: OfficeSnapshot | null,
  message: FeedMessage
): OfficeSnapshot | null {
  if (message.type === 'hello') return message.snapshot
  if (message.type === 'resync' || current === null) return null
  // seq is the revision a patch produces; a duplicate or late one changes nothing.
  if (message.seq <= current.rev) return current
  const sources = message.sources ?? current.sources
  const projectsToday = message.projectsToday ?? current.projectsToday
  const folded = { ...current, rev: message.seq, sources, projectsToday }
  if (message.upserts.length === 0 && message.removed.length === 0) return folded

  // A Map keeps existing keys in place and appends new ones, so floor order is stable.
  const byKey = new Map(current.sessions.map((session) => [session.key, session]))
  for (const key of message.removed) byKey.delete(key)
  for (const session of message.upserts) byKey.set(session.key, session)

  return { ...folded, sessions: [...byKey.values()] }
}
