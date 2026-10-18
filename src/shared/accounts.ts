import { isJsonObject } from './json-object'
import type { AccountConfidence, AccountRef, SessionRef, TokenCounts } from './office/types'

// How long the ledger remembers a quiet transcript or a closed sign-in span. It never counts a
// line older than this in a transcript it has no place for, so the bridge does not post one.
export const USAGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

// Tokens one transcript line added, as the bridge reports them to main. Numbers and labels only.
export interface UsageDelta {
  sessionKey: string
  projectKey: string
  projectLabel: string
  // The transcript the line came from: the ledger counts each line of a file once.
  file: string
  atMs: number
  // The byte the line starts at: the same on every read, and larger for a line appended later.
  position: number
  counts: TokenCounts
}

export interface UsageMessage {
  type: 'usage'
  v: 1
  // Counts up from 1 per bridge; the ledger's answer names the latest it has on disk.
  handover: number
  deltas: UsageDelta[]
}

// What main tells its bridge once the ledger has saved every hand-over up to `handover`.
export interface UsageDurableMessage {
  type: 'usage-durable'
  handover: number
}

// The hand-over a message of `type` names; null for any other message or a malformed number.
export function handoverOf(
  message: unknown,
  type: UsageMessage['type'] | UsageDurableMessage['type']
): number | null {
  if (!isJsonObject(message) || message.type !== type) return null
  const { handover } = message
  return typeof handover === 'number' && Number.isSafeInteger(handover) && handover > 0
    ? handover
    : null
}

// A Codex thread's running total as the bridge last read it, with what the ledger files it
// under. It travels beside the feed, which holds a session's numbers back for the display.
export interface CodexTotal extends Pick<UsageDelta, 'sessionKey' | 'projectKey' | 'projectLabel'> {
  accountKey: string | null
  // null when the thread does not say when it began.
  threadStartedAtMs: number | null
  counts: TokenCounts
}

export interface CodexUsageMessage {
  type: 'codex-usage'
  v: 1
  totals: CodexTotal[]
}

// null for a session that is not Codex's or has no total yet: Claude's tokens are counted from
// its transcript lines.
export function codexTotalOf(session: SessionRef): CodexTotal | null {
  if (session.provider !== 'codex' || !session.usage) return null
  return {
    sessionKey: session.key,
    projectKey: session.projectKey,
    projectLabel: session.projectLabel,
    accountKey: session.accountKey ?? null,
    threadStartedAtMs: session.threadStartedAtMs ?? null,
    counts: session.usage.own
  }
}

export type AccountSource = 'default-login' | 'orca' | 'codex-rollout'

// Local calendar days: `last7Days` is today and the six days before it.
export interface UsageWindows {
  today: TokenCounts
  last7Days: TokenCounts
  sinceTracking: TokenCounts
}

export interface ProjectUsage {
  projectKey: string
  projectLabel: string
  usage: UsageWindows
}

// One limit window as last read; `fetchedAtMs` is its age, and a missing window is unknown.
export interface AccountLimit {
  windowMinutes: number
  // Set when the window covers one model family only. Display words in a view ("Fable");
  // the source's own name ("fableWeekly") inside the ledger.
  scope: string | null
  usedPercent: number
  resetsAtMs: number | null
  source: 'orca-cache'
  fetchedAtMs: number
}

// `label` is what the Office may show. The email stays on the dashboard.
export interface AccountSummary extends AccountRef {
  alias: string | null
  organizationName: string | null
  email: string | null
  sources: AccountSource[]
  firstSeenMs: number
  // exact: the session names its account. inferred: by which account was signed in at the time.
  usage: Record<Exclude<AccountConfidence, 'unattributed'>, UsageWindows>
  projects: ProjectUsage[]
  limits: AccountLimit[]
}

export type AccountsState =
  // `watchAccounts` is off: nothing is read, nothing is counted. The ledger file is kept, so
  // switching it on again resumes.
  | { status: 'off' }
  | {
      status: 'on'
      generatedAtMs: number
      // Tokens are counted on this Mac from this moment on; nothing earlier is attributed.
      trackingSinceMs: number
      accounts: AccountSummary[]
      // Counted, but spent while the signed-in account was not known.
      unattributed: { usage: UsageWindows; projects: ProjectUsage[] }
    }

export const MAX_ALIAS_LENGTH = 40

export interface AliasResult {
  success: boolean
  reason?: 'off' | 'unknown-account' | 'invalid-alias'
}
