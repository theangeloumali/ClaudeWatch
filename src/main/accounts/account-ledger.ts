import {
  type AccountsState,
  type AliasResult,
  type CodexTotal,
  codexTotalOf,
  type UsageDelta
} from '../../shared/accounts'
import type { OfficeSnapshot, ProjectTokens, SessionRef } from '../../shared/office/types'
import { mergeOrcaAccounts, setAlias, upsertClaudeAccount } from './account-records'
import {
  decorateSession,
  decorateSnapshot,
  officeAccounts,
  projectsToday,
  toAccountsState
} from './accounts-view'
import {
  countCodexSessions,
  countUsage,
  prune,
  recordIdentity,
  toCodexTotals,
  toUsageDeltas
} from './attribution'
import type { Identity, IdentityRead } from './identity'
import { dayKey, emptyLedger, type LedgerState } from './ledger-state'
import type { OrcaAccountList } from './orca-accounts'

export interface AccountLedgerOptions {
  isWatching: boolean
  readDefaultIdentity: () => Promise<IdentityRead>
  readOrcaIdentities: () => Promise<Identity[]>
  listOrcaAccounts: () => Promise<OrcaAccountList | null>
  load: () => LedgerState | null
  save: (state: LedgerState) => void
}

// Which account is signed in is lost unless somebody looks: usage can be caught up from
// transcripts later, the login at that moment cannot.
const SAMPLE_INTERVAL_MS = 15_000
const ORCA_INTERVAL_MS = 5 * 60_000
// Opening the Accounts view asks Orca again, but each ask starts Orca's command line.
const ORCA_MIN_GAP_MS = 30_000
// A name the owner typed, or a change of sign-in, is written within this long.
const SAVE_DELAY_MS = 30_000
// Counted tokens wait longer: the bridge saves its offsets only past what was saved here, so
// after a crash it reports those lines again. Only a session that exited within the wait is lost.
const USAGE_SAVE_DELAY_MS = 2 * 60_000
// How long the sign-in has been watched changes at every look and is written this often, and
// at quit: after a restart it is where the open span ends if another account is then found.
const WATCH_SAVE_DELAY_MS = 5 * 60_000
// Tokens are counted on every tick; the dashboard is told of them this often.
const PUBLISH_DELAY_MS = 5_000

// Watches which account is signed in, files token usage under it and keeps the totals on
// disk. With `watchAccounts` off it reads, counts and writes nothing.
export class AccountLedger {
  private state: LedgerState | null = null
  private isWatching: boolean
  // False until the first look after watching began: until then no line can be attributed.
  private hasSampled = false
  private waiting: UsageDelta[] = []
  private waitingTotals: CodexTotal[] = []
  private sampling: Promise<void> | null = null
  private isAskingOrca = false
  private orcaAskedAtMs = Number.NEGATIVE_INFINITY
  private timers: NodeJS.Timeout[] = []
  private saveTimer: NodeJS.Timeout | null = null
  private saveDueAtMs = 0
  private publishTimer: NodeJS.Timeout | null = null
  // The Codex totals last shown, counted again at each look: the feed is silent while nothing changes.
  private observed: readonly CodexTotal[] = []
  private isUnsaved = false
  private hasLoadFailed = false
  private shownToOffice = JSON.stringify(null)
  private shownDay = ''
  // Bumped by every count, so the feed walks today's buckets once per change, not per patch.
  private revision = 0
  private todayTotals: {
    state: LedgerState
    revision: number
    day: string
    totals: ProjectTokens[]
  } | null = null
  private readonly listeners = new Set<(state: AccountsState) => void>()
  private readonly officeListeners = new Set<() => void>()
  private readonly watchingListeners = new Set<() => void>()
  private readonly durableListeners = new Set<() => void>()

  constructor(private readonly options: AccountLedgerOptions) {
    this.isWatching = options.isWatching
  }

  start(): void {
    this.timers = [
      setInterval(() => void this.sample(), SAMPLE_INTERVAL_MS),
      setInterval(() => void this.askOrca(), ORCA_INTERVAL_MS)
    ]
    void this.sample().then(() => this.askOrca())
  }

  stop(): void {
    for (const timer of this.timers) clearInterval(timer)
    this.timers = []
    if (this.publishTimer) clearTimeout(this.publishTimer)
    this.publishTimer = null
    this.save()
  }

  get isWatchingAccounts(): boolean {
    return this.isWatching
  }

  // Fires after watching was switched on or off.
  onWatchingChange(listener: () => void): () => void {
    this.watchingListeners.add(listener)
    return () => {
      this.watchingListeners.delete(listener)
    }
  }

  setWatching(isWatching: boolean): void {
    if (isWatching === this.isWatching) return
    this.isWatching = isWatching
    for (const listener of this.watchingListeners) listener()
    if (isWatching) {
      void this.sample().then(() => this.askOrca())
      return
    }
    this.save()
    // Dropped, so switching back on starts from the file exactly as a restart does.
    this.state = null
    this.todayTotals = null
    this.hasSampled = false
    this.waiting = []
    this.waitingTotals = []
    this.publish()
  }

  // Fires when every usage line handed over so far is on disk or deliberately not counted.
  onUsageDurable(listener: () => void): () => void {
    this.durableListeners.add(listener)
    return () => {
      this.durableListeners.delete(listener)
    }
  }

  onChange(listener: (state: AccountsState) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  // Fires when what the Office shows of accounts changed: a label, a plan, who is signed in.
  onOfficeChange(listener: () => void): () => void {
    this.officeListeners.add(listener)
    return () => {
      this.officeListeners.delete(listener)
    }
  }

  view(): AccountsState {
    return this.tracked ? toAccountsState(this.tracked, Date.now()) : { status: 'off' }
  }

  // What the Accounts view opens with: waits for the first look and refreshes Orca's list.
  async dashboardState(): Promise<AccountsState> {
    if (this.isWatching && !this.hasSampled) await this.sample()
    if (Date.now() - this.orcaAskedAtMs >= ORCA_MIN_GAP_MS) void this.askOrca()
    return this.view()
  }

  setAlias(key: unknown, alias: unknown): AliasResult {
    if (!this.tracked) return { success: false, reason: 'off' }
    const result = setAlias(this.tracked, key, alias)
    if (result.success) this.changed()
    return result
  }

  decorate = (snapshot: OfficeSnapshot): OfficeSnapshot => decorateSnapshot(this.tracked, snapshot)

  decorateSession = (session: SessionRef): SessionRef => decorateSession(this.tracked, session)

  // What `decorate` adds as today's totals, without building a snapshot around them.
  projectsToday = (): ProjectTokens[] | undefined => {
    const state = this.tracked
    if (!state) return undefined
    const now = Date.now()
    const day = dayKey(now)
    const cached = this.todayTotals
    if (cached?.state === state && cached.revision === this.revision && cached.day === day)
      return cached.totals
    const totals = projectsToday(state, now)
    this.todayTotals = { state, revision: this.revision, day, totals }
    return totals
  }

  ingestBridgeMessage(message: unknown): void {
    this.countBridgeMessage(message)
    this.announceDurable()
  }

  private countBridgeMessage(message: unknown): void {
    if (!this.isWatching) return
    const deltas = toUsageDeltas(message)
    const totals = toCodexTotals(message)
    if (!deltas.length && !totals.length) return
    if (this.tracked) {
      const now = Date.now()
      const hasCountedLines = countUsage(this.tracked, deltas, now)
      if (countCodexSessions(this.tracked, totals, now) || hasCountedLines) this.counted()
      // Held only for a loaded ledger awaiting its first look. With no ledger they are dropped:
      // the bridge reports every live transcript again when it next starts.
    } else if (this.state) {
      this.waiting = this.waiting.concat(deltas)
      this.waitingTotals = this.waitingTotals.concat(totals)
    }
  }

  // The feed's own numbers are held back for display, so a total may be older than one the
  // bridge already posted beside it: an older total never lowers what is counted.
  observeSessions(sessions: readonly SessionRef[]): void {
    this.observed = sessions.flatMap((session) => codexTotalOf(session) ?? [])
    if (this.tracked && countCodexSessions(this.tracked, this.observed, Date.now())) this.counted()
  }

  // The ledger once it can attribute: watching, loaded, and having looked at least once.
  private get tracked(): LedgerState | null {
    return this.isWatching && this.hasSampled ? this.state : null
  }

  private sample(): Promise<void> {
    // A look runs off a timer for the life of the app: a failure is reported, never thrown.
    this.sampling ??= this.lookAtLogin()
      .catch(() => console.error('[accounts] the sign-in could not be read'))
      .finally(() => {
        this.sampling = null
      })
    return this.sampling
  }

  private async lookAtLogin(): Promise<void> {
    if (!this.isWatching || !this.load()) return
    const read = await this.options.readDefaultIdentity()
    const state = this.state
    // Watching may have been switched off while the file was being read.
    if (!this.isWatching || !state) return
    const now = Date.now()
    const before = JSON.stringify([state.accounts, state.spans])
    const watchedUntilMs = state.sampledAtMs
    recordIdentity(state, read, now)
    prune(state, now)
    if (state.sampledAtMs !== watchedUntilMs) this.saveWithin(WATCH_SAVE_DELAY_MS)
    const isFirstLook = !this.hasSampled
    this.hasSampled = true
    const hasCountedLines = countUsage(state, this.waiting, now)
    // Also what registers a Codex session shown before this look, or forgotten by the prune.
    const codexTotals = [...this.observed, ...this.waitingTotals]
    this.waiting = []
    this.waitingTotals = []
    const hasCounted = countCodexSessions(state, codexTotals, now) || hasCountedLines
    if (before !== JSON.stringify([state.accounts, state.spans])) return this.changed()
    if (hasCounted) this.counted()
    if (isFirstLook || dayKey(now) !== this.shownDay) this.publish()
    this.announceDurable()
  }

  private load(): boolean {
    if (this.state) return true
    try {
      this.state = this.options.load() ?? emptyLedger(Date.now())
      this.hasLoadFailed = false
    } catch {
      // The error names a path under the user's home, so only the fact is logged, and once.
      if (!this.hasLoadFailed) console.error('[accounts] the ledger could not be read')
      this.hasLoadFailed = true
    }
    return this.state !== null
  }

  private async askOrca(): Promise<void> {
    if (!this.tracked || this.isAskingOrca) return
    this.isAskingOrca = true
    this.orcaAskedAtMs = Date.now()
    try {
      const [identities, list] = await Promise.all([
        this.options.readOrcaIdentities(),
        this.options.listOrcaAccounts()
      ])
      const state = this.tracked
      if (!state) return
      const fingerprint = (): string =>
        JSON.stringify([state.accounts, [...state.limits], state.codexDefaultKey])
      const before = fingerprint()
      for (const identity of identities) upsertClaudeAccount(state, identity, 'orca', Date.now())
      if (list) mergeOrcaAccounts(state, list, Date.now())
      if (before !== fingerprint()) this.changed()
    } catch {
      console.error('[accounts] Orca’s accounts could not be read')
    } finally {
      this.isAskingOrca = false
    }
  }

  private changed(): void {
    this.revision++
    this.saveWithin(SAVE_DELAY_MS)
    this.publish()
  }

  // Tokens were counted and nothing else changed: the Office hears at once of an account that
  // came with them, the dashboard's totals follow in one batch.
  private counted(): void {
    this.revision++
    this.saveWithin(USAGE_SAVE_DELAY_MS)
    this.publishToOffice()
    this.publishTimer ??= setTimeout(() => this.publish(), PUBLISH_DELAY_MS)
  }

  private saveWithin(delayMs: number): void {
    this.isUnsaved = true
    const dueAtMs = Date.now() + delayMs
    if (this.saveTimer && this.saveDueAtMs <= dueAtMs) return
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveDueAtMs = dueAtMs
    this.saveTimer = setTimeout(() => this.save(), delayMs)
  }

  private save(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    if (!this.isUnsaved || !this.state) return
    try {
      this.options.save(this.state)
      this.isUnsaved = false
    } catch {
      console.error('[accounts] the ledger could not be saved')
    }
    this.announceDurable()
  }

  // Lines dropped by a ledger that could not be read are not durable: a restart reports them.
  private announceDurable(): void {
    const isHolding = this.waiting.length > 0 || (this.isWatching && !this.state)
    if (this.isUnsaved || isHolding) return
    for (const listener of this.durableListeners) listener()
  }

  private publish(): void {
    if (this.publishTimer) clearTimeout(this.publishTimer)
    this.publishTimer = null
    this.shownDay = dayKey(Date.now())
    // The view walks every bucket: it is built only for somebody.
    if (this.listeners.size) {
      const view = this.view()
      for (const listener of this.listeners) listener(view)
    }
    this.publishToOffice()
  }

  private publishToOffice(): void {
    const office = JSON.stringify(this.tracked && officeAccounts(this.tracked))
    if (office === this.shownToOffice) return
    this.shownToOffice = office
    for (const listener of this.officeListeners) listener()
  }
}
