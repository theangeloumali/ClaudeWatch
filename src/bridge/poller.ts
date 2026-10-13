import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  type CodexTotal,
  codexTotalOf,
  type UsageDelta,
  USAGE_RETENTION_MS
} from '../shared/accounts'
import { LIVE_POLL_MS, QUIET_FEED_MS } from '../shared/office/pace'
import type { FeedMessage, OfficeSnapshot } from '../shared/office/types'
import { type BridgeIo, systemIo } from './io'
import { type ClaudeBatch, collectClaude } from './registry'
import { type CodexBatch, collectCodex } from './codex'
import { collectOpencode } from './opencode'
import { claimPanes, OrcaSource } from './orca'
import { type ProcessRow, readProcessTable } from './process-table'
import { diff, emptySnapshot, reduce } from './reducer'
import { TeammateSource } from './teammates'
import { UsageThrottle } from './usage-throttle'
import { type TranscriptDelta, UsageTracker } from './usage-tracker'

export interface PollerOptions {
  io?: BridgeIo
  claudeRoots?: string[]
  codexRoot?: string
  // OpenCode's data folder, holding its session database.
  opencodeRoot?: string
  now?: () => number
  // Hears the tokens every tick added, line by line, for whoever attributes them to an account.
  onUsage?: (deltas: UsageDelta[]) => void
  // Hears every Codex total that changed, unheld: a Codex session keeps a running total, not lines.
  onCodexTotals?: (totals: CodexTotal[]) => void
  // Whether a Codex session is given the hashed key of its account: only while accounts are watched.
  derivesAccounts?: boolean
  // Decides how each source finds its processes and reads their paths.
  platform?: NodeJS.Platform
}
export class BridgePoller {
  private snapshot = emptySnapshot()
  private intervalMs = LIVE_POLL_MS
  // Set while polling: restarts the timer at the current interval, and polls now if asked.
  private repace: ((pollNow: boolean) => void) | null = null
  private readonly io: BridgeIo
  private readonly orca: OrcaSource
  private readonly teammates: TeammateSource
  private readonly usage: UsageTracker
  private readonly throttle = new UsageThrottle()
  // The project of each session whose lines are still being reported: one that left is not in
  // the tick that reads its last lines.
  private readonly projects = new Map<string, Pick<UsageDelta, 'projectKey' | 'projectLabel'>>()
  // Each live Codex session's total as last posted, so only a change is posted.
  private readonly postedCodex = new Map<string, string>()
  private readonly roots: string[]
  private readonly codexRoot: string
  private readonly opencodeRoot: string
  private readonly now: () => number
  private readonly onUsage: PollerOptions['onUsage']
  private readonly onCodexTotals: PollerOptions['onCodexTotals']
  private readonly derivesAccounts: boolean
  private readonly platform: NodeJS.Platform
  private pending: Promise<OfficeSnapshot> | null = null
  constructor(options: PollerOptions = {}) {
    this.io = options.io ?? systemIo
    this.platform = options.platform ?? process.platform
    this.orca = new OrcaSource(this.io, this.platform)
    this.teammates = new TeammateSource(this.io, this.platform)
    this.usage = new UsageTracker(this.io)
    this.roots = options.claudeRoots ?? [join(homedir(), '.claude')]
    this.codexRoot = options.codexRoot ?? join(homedir(), '.codex')
    this.opencodeRoot = options.opencodeRoot ?? join(homedir(), '.local/share/opencode')
    this.now = options.now ?? Date.now
    this.onUsage = options.onUsage
    this.onCodexTotals = options.onCodexTotals
    this.derivesAccounts = options.derivesAccounts ?? false
  }
  tick(): Promise<OfficeSnapshot> {
    if (this.pending) return this.pending
    this.pending = this.ingest().finally(() => {
      this.pending = null
    })
    return this.pending
  }
  // True until every live transcript has been counted; a one-shot run waits on it.
  get isCountingUsage(): boolean {
    return this.usage.isBehind
  }
  private async ingest(): Promise<OfficeSnapshot> {
    const now = this.now()
    // One process table, read and parsed once, serves every source: it is the tick's most
    // expensive read.
    let processTable: Promise<ProcessRow[]> | undefined
    const readProcesses = (): Promise<ProcessRow[]> =>
      (processTable ??= readProcessTable(this.io, this.platform))
    const [claude, codex, opencode, orca] = await Promise.all([
      collectClaude(this.roots, this.io, now, this.teammates, readProcesses, this.platform),
      collectCodex(
        this.codexRoot,
        this.io,
        readProcesses,
        this.derivesAccounts,
        now,
        this.platform
      ),
      collectOpencode(this.opencodeRoot, this.io, readProcesses, now, this.platform),
      this.orca.poll(now)
    ])
    // The first snapshot goes out with usage unknown, so no window waits on a first scan: that
    // scan reads nothing, and only notes the transcripts a session leaving before the next had.
    await this.scanUsage(claude, now, this.snapshot.rev > 0 ? undefined : 0)
    const paneHolders = [...claude.sessions, ...opencode.sessions]
    this.orca.prune(paneHolders)
    const enriched = claimPanes(
      await Promise.all(paneHolders.map((session) => this.orca.enrich(session, now)))
    )
    // Only Claude's tokens are counted from transcripts; the others carry their own totals.
    const sessions = [
      ...enriched.map((session) =>
        session.provider === 'claude' ? this.usage.fill(session) : session
      ),
      ...codex.sessions
    ]
    this.reportCodex(codex)
    this.throttle.prune(new Set(sessions.map((session) => session.key)))
    this.snapshot = reduce(this.snapshot, {
      now,
      sessions: sessions.map((session) => this.throttle.apply(session, now)),
      sources: [...claude.sources, ...codex.sources, ...opencode.sources, orca, this.usage.health()]
    })
    return this.snapshot
  }
  // Tells of each Codex total the tick it is read, and of the one a session that left ended
  // on: the snapshot holds a session's numbers for the display, and drops one that has left.
  private reportCodex({ sessions, departed }: CodexBatch): void {
    if (!this.onCodexTotals) return
    const live = sessions.flatMap((session) => codexTotalOf(session) ?? [])
    const changed = [...live, ...departed].filter(
      (total) => this.postedCodex.get(total.sessionKey) !== JSON.stringify(total)
    )
    for (const total of changed) this.postedCodex.set(total.sessionKey, JSON.stringify(total))
    const liveKeys = new Set(sessions.map((session) => session.key))
    for (const key of this.postedCodex.keys()) if (!liveKeys.has(key)) this.postedCodex.delete(key)
    if (changed.length) this.onCodexTotals(changed)
  }

  private async scanUsage(claude: ClaudeBatch, now: number, budgetBytes?: number): Promise<void> {
    if (!this.onUsage) return this.usage.scan(claude.transcripts, undefined, budgetBytes)
    for (const { key, projectKey, projectLabel } of claude.sessions)
      this.projects.set(key, { projectKey, projectLabel })
    const added: TranscriptDelta[] = []
    // A first scan reads months of lines; the ledger would drop all but the last week of them.
    const oldestKept = now - USAGE_RETENTION_MS
    await this.usage.scan(
      claude.transcripts,
      (delta) => {
        if (delta.atMs > oldestKept) added.push(delta)
      },
      budgetBytes
    )
    const deltas = added.flatMap((delta): UsageDelta[] => {
      const project = this.projects.get(delta.sessionKey)
      return project ? [{ ...delta, ...project }] : []
    })
    const live = new Set(claude.sessions.map((session) => session.key))
    for (const key of this.projects.keys())
      if (!live.has(key) && !this.usage.isLeaving(key)) this.projects.delete(key)
    if (deltas.length) this.onUsage(deltas)
  }
  async start(post: (message: FeedMessage) => void): Promise<() => void> {
    let previous = await this.tick()
    post({ type: 'hello', v: 1, snapshot: previous })
    let postedAtMs = previous.generatedAtMs
    let stopped = false
    let polling = false
    const poll = async (): Promise<void> => {
      if (stopped || polling) return
      polling = true
      try {
        const next = await this.tick()
        if (stopped) return
        const patch = diff(previous, next, next.rev)
        previous = next
        // A tick that changed nothing posts nothing, until the feed has been quiet too long.
        const isEmpty = !patch.upserts.length && !patch.removed.length && !patch.sources
        if (isEmpty && next.generatedAtMs - postedAtMs < QUIET_FEED_MS) return
        postedAtMs = next.generatedAtMs
        post(patch)
      } catch {
        // The next tick tries again. The cause may name local paths, so it is not written out.
        process.stderr.write('Office bridge tick failed\n')
      } finally {
        polling = false
      }
    }
    let timer: NodeJS.Timeout | undefined
    this.repace = (pollNow) => {
      clearInterval(timer)
      timer = setInterval(() => void poll(), this.intervalMs)
      if (pollNow) void poll()
    }
    this.repace(false)
    return () => {
      stopped = true
      this.repace = null
      clearInterval(timer)
    }
  }

  // Changes how often the poll repeats. Speeding up polls at once, so a window that has just
  // come back does not wait out the slow interval to show current state.
  setIntervalMs(intervalMs: number): void {
    const isFaster = intervalMs < this.intervalMs
    this.intervalMs = intervalMs
    this.repace?.(isFaster)
  }
}
