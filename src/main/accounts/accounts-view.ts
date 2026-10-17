import { addCounts, sumCounts, zeroCounts } from '../../shared/office/token-counts'
import type {
  AccountsState,
  AccountSummary,
  ProjectUsage,
  UsageWindows
} from '../../shared/accounts'
import type {
  AccountConfidence,
  AccountRef,
  OfficeSnapshot,
  ProjectTokens,
  SessionRef
} from '../../shared/office/types'
import { limitScopeName, officeLabel, planName } from './display-names'
import {
  type AccountRecord,
  dayKey,
  type LedgerState,
  type UsageBucket,
  weekStartKey
} from './ledger-state'

// The Office and its feed never carry an email, and an organisation is often named after one
// ("ada@example.com's Organization"): such a name gives way to the neutral label.
function accountLabel(account: AccountRecord): string {
  const named = officeLabel(account.alias ?? account.organizationName ?? '')
  if (named) return named
  const provider = account.provider === 'claude' ? 'Claude' : 'Codex'
  return `${provider} account ${account.key.slice(-4)}`
}

// The account signed in on the shared Claude login right now, if that is known.
function activeClaudeKey(state: LedgerState): string | null {
  const last = state.spans.at(-1)
  return last?.toMs === null ? last.accountKey : null
}

function toAccountRef(state: LedgerState, account: AccountRecord): AccountRef {
  return {
    key: account.key,
    provider: account.provider,
    label: accountLabel(account),
    plan: account.plan === null ? null : planName(account.plan),
    isActive: account.key === activeClaudeKey(state) || account.key === state.codexDefaultKey
  }
}

export function officeAccounts(state: LedgerState): AccountRef[] {
  return state.accounts.map((account) => toAccountRef(state, account))
}

// `state` is null while accounts are not watched: then no session carries an account.
export function decorateSession(state: LedgerState | null, session: SessionRef): SessionRef {
  if (!state) return { ...session, accountKey: null, accountConfidence: undefined }
  // A Codex session names its own account; Claude sessions share whichever login is active.
  const accountKey =
    session.provider === 'claude' ? activeClaudeKey(state) : (session.accountKey ?? null)
  const known: AccountConfidence = session.provider === 'claude' ? 'inferred' : 'exact'
  return { ...session, accountKey, accountConfidence: accountKey ? known : 'unattributed' }
}

// Today's tokens per project, whichever account spent them; in key order, so totals compare.
function projectsToday(state: LedgerState, now: number): ProjectTokens[] {
  const today = dayKey(now)
  const totals = new Map<string, number>()
  for (const bucket of state.buckets.values()) {
    if (bucket.day !== today) continue
    totals.set(bucket.projectKey, (totals.get(bucket.projectKey) ?? 0) + sumCounts(bucket.counts))
  }
  return [...totals]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([projectKey, tokens]) => ({ projectKey, tokens }))
}

export function decorateSnapshot(
  state: LedgerState | null,
  snapshot: OfficeSnapshot,
  now = Date.now()
): OfficeSnapshot {
  const decorated = {
    ...snapshot,
    sessions: snapshot.sessions.map((session) => decorateSession(state, session)),
    accounts: state ? officeAccounts(state) : []
  }
  return state ? { ...decorated, projectsToday: projectsToday(state, now) } : decorated
}

const zeroWindows = (): UsageWindows => ({
  today: zeroCounts(),
  last7Days: zeroCounts(),
  sinceTracking: zeroCounts()
})

interface Tally {
  usage: Record<AccountConfidence, UsageWindows>
  projects: Map<string, UsageWindows>
}

const total = (windows: UsageWindows): number =>
  Object.values(windows.sinceTracking).reduce((sum, amount) => sum + amount, 0)

function toProjects(state: LedgerState, tally: Tally | undefined): ProjectUsage[] {
  return [...(tally?.projects ?? [])]
    .map(([projectKey, usage]) => ({
      projectKey,
      projectLabel: state.projects.get(projectKey) ?? projectKey,
      usage
    }))
    .sort((a, b) => total(b.usage) - total(a.usage))
}

export function toAccountsState(state: LedgerState, now: number): AccountsState {
  const today = dayKey(now)
  const weekStart = weekStartKey(now)
  const add = (windows: UsageWindows, bucket: UsageBucket): void => {
    windows.sinceTracking = addCounts(windows.sinceTracking, bucket.counts)
    if (bucket.day >= weekStart) windows.last7Days = addCounts(windows.last7Days, bucket.counts)
    if (bucket.day === today) windows.today = addCounts(windows.today, bucket.counts)
  }
  const recorded = new Set(state.accounts.map((account) => account.key))
  const tallies = new Map<string | null, Tally>()
  for (const bucket of state.buckets.values()) {
    // Tokens filed under an account that is no longer on record are still shown, unattributed.
    const isOwned = bucket.accountKey !== null && recorded.has(bucket.accountKey)
    const owner = isOwned ? bucket.accountKey : null
    let tally = tallies.get(owner)
    if (!tally) {
      tally = {
        usage: { exact: zeroWindows(), inferred: zeroWindows(), unattributed: zeroWindows() },
        projects: new Map()
      }
      tallies.set(owner, tally)
    }
    add(tally.usage[isOwned ? bucket.confidence : 'unattributed'], bucket)
    const project = tally.projects.get(bucket.projectKey) ?? zeroWindows()
    tally.projects.set(bucket.projectKey, project)
    add(project, bucket)
  }
  const unattributed = tallies.get(null)
  return {
    status: 'on',
    generatedAtMs: now,
    trackingSinceMs: state.trackingSinceMs,
    accounts: state.accounts.map((account): AccountSummary => {
      const tally = tallies.get(account.key)
      return {
        ...toAccountRef(state, account),
        alias: account.alias,
        organizationName: account.organizationName,
        email: account.email,
        sources: [...account.sources],
        firstSeenMs: account.firstSeenMs,
        usage: {
          exact: tally?.usage.exact ?? zeroWindows(),
          inferred: tally?.usage.inferred ?? zeroWindows()
        },
        projects: toProjects(state, tally),
        limits: (state.limits.get(account.key) ?? []).map((limit) => ({
          ...limit,
          scope: limit.scope === null ? null : limitScopeName(limit.scope)
        }))
      }
    }),
    unattributed: {
      usage: unattributed?.usage.unattributed ?? zeroWindows(),
      projects: toProjects(state, unattributed)
    }
  }
}
