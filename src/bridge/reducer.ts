import type { FeedMessage, OfficeSnapshot, SessionRef, SourceHealth } from '../shared/office/types'
import { quietFor } from './liveness'

const DONE_BADGE_MS = 120_000

export interface IngestBatch {
  now: number
  sessions: SessionRef[]
  sources: SourceHealth[]
}

// A process-backed key can outlive the conversation it first identified.
function sameSessionIdentity(previous: SessionRef, current: SessionRef): boolean {
  return (
    previous.provider === current.provider &&
    previous.sessionId === current.sessionId &&
    previous.pid === current.pid &&
    previous.startedAtMs === current.startedAtMs
  )
}

export function emptySnapshot(): OfficeSnapshot {
  return { rev: 0, generatedAtMs: 0, sessions: [], sources: [] }
}
export function reduce(prev: OfficeSnapshot, batch: IngestBatch): OfficeSnapshot {
  const previous = new Map(prev.sessions.map((session) => [session.key, session]))
  const sessions = new Map<string, SessionRef>()
  for (const session of batch.sessions) {
    const old = previous.get(session.key)
    const quietMs = quietFor(batch.now, session.updatedAtMs)
    const recentlyFinished =
      session.activity === 'idle' &&
      old &&
      sameSessionIdentity(old, session) &&
      (old.activity !== 'idle' || old.attention === 'done') &&
      quietMs !== null &&
      quietMs < DONE_BADGE_MS
    sessions.set(
      session.key,
      recentlyFinished && session.attention === 'none'
        ? { ...session, attention: 'done' }
        : { ...session }
    )
  }
  const failedSources = new Set(
    batch.sources.filter((source) => !source.ok).map((source) => source.id)
  )
  const sourceFailed = (session: SessionRef): boolean =>
    session.observation
      ? failedSources.has(session.observation.sourceId)
      : batch.sources.some(
          (source) =>
            !source.ok &&
            (source.id === session.provider || source.id.startsWith(`${session.provider}:`))
        )
  for (const session of prev.sessions) {
    if (!sourceFailed(session)) continue
    const current = sessions.get(session.key)
    if (!current) sessions.set(session.key, session)
    else if (sameSessionIdentity(session, current)) {
      const currentIds = new Set(current.subagents.map((member) => member.id))
      const retained = session.subagents.filter((member) => !currentIds.has(member.id))
      if (retained.length)
        sessions.set(session.key, { ...current, subagents: [...current.subagents, ...retained] })
    }
  }
  const previousSources = new Map(prev.sources.map((source) => [source.id, source]))
  return {
    rev: prev.rev + 1,
    generatedAtMs: batch.now,
    sessions: [...sessions.values()].sort((a, b) => a.key.localeCompare(b.key)),
    sources: batch.sources.map((source) => ({ ...previousSources.get(source.id), ...source }))
  }
}
export function diff(
  prev: OfficeSnapshot,
  next: OfficeSnapshot,
  seq: number
): Extract<FeedMessage, { type: 'patch' }> {
  const old = new Map(prev.sessions.map((session) => [session.key, JSON.stringify(session)]))
  const keys = new Set(next.sessions.map((session) => session.key))
  return {
    type: 'patch',
    v: 1,
    seq,
    upserts: next.sessions.filter((session) => old.get(session.key) !== JSON.stringify(session)),
    removed: prev.sessions
      .filter((session) => !keys.has(session.key))
      .map((session) => session.key),
    ...(JSON.stringify(prev.sources) !== JSON.stringify(next.sources) && { sources: next.sources })
  }
}
