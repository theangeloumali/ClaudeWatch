import { dayKey } from '../../shared/day-key'
import { addCounts } from '../../shared/office/token-counts'
import type { AccountLimit, AccountSource } from '../../shared/accounts'
import type { AccountConfidence, ProviderId, TokenCounts } from '../../shared/office/types'

// Main only. The email is the one personal value kept, and only the dashboard is sent it.
export interface AccountRecord {
  // `${provider}:${hash of the provider's account id}`; the id itself is not stored.
  key: string
  provider: ProviderId
  email: string | null
  organizationUuid: string | null
  organizationName: string | null
  plan: string | null
  alias: string | null
  orcaAccountId: string | null
  sources: AccountSource[]
  firstSeenMs: number
}

// A stretch of time one account was signed in on the shared login; open while `toMs` is null.
export interface IdentitySpan {
  accountKey: string
  fromMs: number
  toMs: number | null
}

export interface UsageBucket {
  // null: spent while nobody knew which account was signed in.
  accountKey: string | null
  day: string // local YYYY-MM-DD
  projectKey: string
  confidence: AccountConfidence
  counts: TokenCounts
}

// How far a transcript has been counted: the time of its latest counted line and the byte its
// furthest one starts at.
export interface TranscriptPlace {
  atMs: number
  position: number
}

// The position of a transcript counted by time alone: no line starts beyond it.
export const BEYOND_ANY_LINE = Number.POSITIVE_INFINITY

export interface LedgerState {
  // Nothing written before this moment is ever counted.
  trackingSinceMs: number
  sampledAtMs: number | null
  accounts: AccountRecord[]
  codexDefaultKey: string | null
  spans: IdentitySpan[]
  buckets: Map<string, UsageBucket>
  projects: Map<string, string>
  files: Map<string, TranscriptPlace>
  // Codex session key to the highest running total already counted.
  codexSessions: Map<string, { counts: TokenCounts; countedAtMs: number }>
  limits: Map<string, AccountLimit[]>
}

export function emptyLedger(now: number): LedgerState {
  return {
    trackingSinceMs: now,
    sampledAtMs: null,
    accounts: [],
    codexDefaultKey: null,
    spans: [],
    buckets: new Map(),
    projects: new Map(),
    files: new Map(),
    codexSessions: new Map(),
    limits: new Map()
  }
}

export { dayKey }

// The first of the seven local days the Accounts view counts as its week, today included.
export function weekStartKey(now: number): string {
  const date = new Date(now)
  return dayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 6).getTime())
}

// The day of a bucket holding everything older than that week. It sorts before any real day.
export const FOLDED_DAY = '0000-00-00'

export const bucketId = (bucket: Omit<UsageBucket, 'counts'>): string =>
  [bucket.accountKey ?? '', bucket.day, bucket.projectKey, bucket.confidence].join('|')

export function addUsage(state: LedgerState, bucket: UsageBucket): void {
  const id = bucketId(bucket)
  const existing = state.buckets.get(id)
  state.buckets.set(
    id,
    existing ? { ...existing, counts: addCounts(existing.counts, bucket.counts) } : bucket
  )
}
