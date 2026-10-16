import type { UsageDelta } from '../shared/accounts'
import { addCounts, zeroCounts } from '../shared/office/token-counts'
import type { SessionRef, SessionUsage, SourceHealth, TokenCounts } from '../shared/office/types'
import { type BridgeIo, isMissing } from './io'
import type { AgentFile } from './subagents'
import {
  contextTokens,
  emptyFold,
  foldLines,
  foldTotal,
  type UsageFold,
  type UsageIncrement
} from './usage-fold'
import type { UsageOffset } from './usage-offsets'

// What one line added to one transcript; the poller adds the session's project.
export type TranscriptDelta = Omit<UsageDelta, 'projectKey' | 'projectLabel'>

export interface SessionFiles {
  main: string
  // Every agent transcript under the session, finished ones included: they spent the tokens.
  agents: AgentFile[]
  // Teammate id to its own transcript, followed by those of the agents it spawned.
  teammates: Map<string, string[]>
}

interface TrackedFile {
  offset: number
  fold: UsageFold
  hasReachedEnd: boolean
  ino?: number
}

// A full tick of this many bytes takes about 0.6 s: 880 MB of live transcripts take four.
const TICK_BUDGET_BYTES = 256 * 1024 * 1024
// The longest transcript line measured is 1.3 MB; a read this size always holds a whole one.
const CHUNK_BYTES = 8 * 1024 * 1024
// A session a new bridge has not listed within this many scans had ended: its saved offset goes.
const RESUME_SCANS = 30

export class UsageTracker {
  private readonly budgetBytes: number
  private readonly chunkBytes: number
  private files = new Map<string, TrackedFile>()
  private sessions: ReadonlyMap<string, SessionFiles> = new Map()
  // Every teammate transcript a session has listed. A teammate leaves the roster when its
  // process exits, but what it spent stays in its lead's total until the lead itself leaves.
  private teammatePaths = new Map<string, Set<string>>()
  // Sessions that left, each with the transcripts not yet read to their end: what one wrote
  // after the last scan that saw it is on disk, and no later scan would list it.
  private leaving = new Map<string, string[]>()
  private counted = new Set<string>()
  // Offsets an earlier bridge saved, each taken up once if its file is still the same one.
  private saved = new Map<string, UsageOffset>()
  private scansSinceResume = 0
  private behind = true
  private failed = false

  constructor(
    private readonly io: BridgeIo,
    limits: { budgetBytes?: number; chunkBytes?: number } = {}
  ) {
    this.budgetBytes = limits.budgetBytes ?? TICK_BUDGET_BYTES
    this.chunkBytes = limits.chunkBytes ?? CHUNK_BYTES
  }

  resume(saved: ReadonlyMap<string, UsageOffset>): void {
    this.saved = new Map(saved)
    this.scansSinceResume = 0
  }

  // Where each transcript's count stands, for the next bridge to resume from; one saved but not
  // yet listed again is kept, so a session discovered late does not read its history again.
  offsets(): Map<string, UsageOffset> {
    const tracked = [...this.files].flatMap(
      ([path, { offset, fold, ino }]): [string, UsageOffset][] =>
        ino === undefined ? [] : [[path, { offset, fold, ino }]]
    )
    return new Map([...this.saved, ...tracked])
  }

  // Reads what was appended since the last scan, up to the byte budget. State for a transcript
  // that is no longer wanted is dropped here, so it stays bounded however long the bridge runs.
  // `onAdded` hears what every newly read line added. A transcript read again from its start
  // is reported again, so the listener must count each line of a file once. With a listener, a
  // session that left is read to its end before its state goes. A scan given no bytes reads
  // nothing and still notes every transcript.
  async scan(
    sessions: ReadonlyMap<string, SessionFiles>,
    onAdded?: (delta: TranscriptDelta) => void,
    budgetBytes = this.budgetBytes
  ): Promise<void> {
    if (onAdded) {
      for (const [key, files] of this.sessions) {
        if (!sessions.has(key))
          this.leaving.set(key, [files.main, ...this.spawnedPaths(key, files)])
      }
    }
    if (++this.scansSinceResume > RESUME_SCANS) this.saved.clear()
    for (const key of sessions.keys()) this.leaving.delete(key)
    this.sessions = sessions
    for (const key of this.teammatePaths.keys())
      if (!sessions.has(key)) this.teammatePaths.delete(key)
    const wanted = new Map<string, number | null>()
    const owners = new Map<string, string>()
    // Listed first, so a session that left is read before the budget goes to the live ones. A
    // transcript a live session also lists (an orphaned teammate's) is reported under that one.
    for (const [sessionKey, paths] of this.leaving) {
      for (const path of paths) {
        wanted.set(path, null)
        owners.set(path, sessionKey)
      }
    }
    for (const [sessionKey, files] of sessions) {
      const listed = this.teammatePaths.get(sessionKey) ?? new Set<string>()
      for (const path of [...files.teammates.values()].flat()) listed.add(path)
      this.teammatePaths.set(sessionKey, listed)
      for (const path of [files.main, ...this.spawnedPaths(sessionKey, files)]) {
        wanted.set(path, null)
        owners.set(path, sessionKey)
      }
      for (const agent of files.agents) wanted.set(agent.path, agent.size)
    }
    for (const path of this.files.keys()) if (!wanted.has(path)) this.files.delete(path)
    for (const key of this.counted) if (!sessions.has(key)) this.counted.delete(key)

    let remaining = budgetBytes
    // A scan given no bytes has counted nothing, whatever it found.
    this.behind = budgetBytes <= 0
    this.failed = false
    // Transcripts this scan stopped short of the end of; one that is gone or unreadable is not held.
    const unfinished = new Set<string>()
    for (const [path, knownSize] of wanted) {
      try {
        // A listed agent's size is known; it is asked about once, for the inode a resume needs.
        const info =
          knownSize === null || !this.files.has(path)
            ? await this.io.stat(path)
            : { size: knownSize, ino: this.files.get(path)?.ino }
        const size = knownSize ?? info.size
        const sessionKey = owners.get(path)
        const report =
          onAdded && sessionKey !== undefined
            ? (increment: UsageIncrement): void => onAdded({ sessionKey, file: path, ...increment })
            : undefined
        const { spent, isAtEnd } = await this.advance(
          path,
          { size, ino: info.ino },
          remaining,
          report
        )
        remaining -= spent
        if (!isAtEnd) unfinished.add(path)
      } catch (error) {
        this.files.delete(path)
        if (!isMissing(error)) this.failed = true
      }
    }
    for (const [key, paths] of this.leaving) {
      const unread = paths.filter((path) => unfinished.has(path))
      if (unread.length) this.leaving.set(key, unread)
      else this.leaving.delete(key)
    }
    for (const [key, files] of sessions) {
      if (!this.files.has(files.main)) this.counted.delete(key)
      // A sidecar that vanished or cannot be read holds nothing back; health reports the failure.
      else if (
        [files.main, ...this.spawnedPaths(key, files)].every(
          (path) => this.files.get(path)?.hasReachedEnd !== false
        )
      )
        this.counted.add(key)
    }
  }

  private async advance(
    path: string,
    { size, ino }: { size: number; ino?: number },
    budget: number,
    report?: (increment: UsageIncrement) => void
  ): Promise<{ spent: number; isAtEnd: boolean }> {
    let file = this.files.get(path) ?? this.takeSaved(path)
    // A file shorter than what was read, or another file under the name, is counted from the start.
    if (
      !file ||
      size < file.offset ||
      (ino !== undefined && file.ino !== undefined && ino !== file.ino)
    )
      file = { offset: 0, fold: emptyFold(), hasReachedEnd: false }
    file.ino ??= ino
    this.files.set(path, file)
    let spent = 0
    while (file.offset < size) {
      const window = Math.min(this.chunkBytes, budget - spent)
      if (window <= 0) {
        this.behind = true
        return { spent, isAtEnd: false }
      }
      const read = await this.io.readFrom(path, file.offset, window)
      if (read.nextOffset > file.offset) {
        // Measured back from the end of the read: one resumed inside a character after a skipped
        // line decodes its first bytes to a different length, and every line would shift.
        const startsAt = report ? read.nextOffset - Buffer.byteLength(read.text) : file.offset
        file.fold = foldLines(file.fold, read.text, report, startsAt)
        spent += read.nextOffset - file.offset
        file.offset = read.nextOffset
        continue
      }
      // No whole line in the window: the half-written last line, which waits for its newline.
      if (size - file.offset <= window) break
      if (window < this.chunkBytes) {
        this.behind = true
        return { spent, isAtEnd: false }
      }
      // A line longer than a full read is skipped; what is left of it will not parse.
      file.offset += window
      spent += window
    }
    file.hasReachedEnd = true
    return { spent, isAtEnd: true }
  }

  private takeSaved(path: string): TrackedFile | undefined {
    const saved = this.saved.get(path)
    if (!saved) return undefined
    this.saved.delete(path)
    return { offset: saved.offset, fold: saved.fold, ino: saved.ino, hasReachedEnd: false }
  }

  private spawnedPaths(sessionKey: string, files: SessionFiles): string[] {
    return [
      ...files.agents.map((agent) => agent.path),
      ...(this.teammatePaths.get(sessionKey) ?? [])
    ]
  }

  // null until every transcript of the session has been read to its end once.
  usage(key: string): SessionUsage | null {
    const files = this.sessions.get(key)
    const main = files && this.files.get(files.main)
    if (!files || !main || !this.counted.has(key)) return null
    const spawned = this.spawnedPaths(key, files)
    return {
      own: foldTotal(main.fold),
      subagents: this.tokens(spawned) ?? zeroCounts(),
      spawned: spawned.length,
      contextTokens: contextTokens(main.fold),
      contextLimit: null
    }
  }

  // What these transcripts spent together; null when none of them is being counted.
  tokens(paths: string[]): TokenCounts | null {
    const folds = paths.flatMap((path) => this.files.get(path)?.fold ?? [])
    return folds.length
      ? folds.reduce((sum, fold) => addCounts(sum, foldTotal(fold)), zeroCounts())
      : null
  }

  // The session with its counters and each live agent's own; all unknown until it is counted.
  fill(session: SessionRef): SessionRef {
    const usage = this.usage(session.key)
    const files = this.sessions.get(session.key)
    const paths = new Map<string, string[]>([
      ...(files?.agents ?? []).map((agent): [string, string[]] => [agent.id, [agent.path]]),
      ...(files?.teammates ?? [])
    ])
    return {
      ...session,
      usage,
      subagents: session.subagents.map((agent) => ({
        ...agent,
        tokens: usage ? this.tokens(paths.get(agent.id) ?? []) : null
      }))
    }
  }

  // True until a scan has read every transcript to its end within the byte budget.
  get isBehind(): boolean {
    return this.behind
  }

  // True while a session that left still has lines to report under its key.
  isLeaving(key: string): boolean {
    return this.leaving.has(key)
  }

  health(): SourceHealth {
    if (this.failed) return { id: 'usage', ok: false, detail: 'transcript read failed' }
    return { id: 'usage', ok: true, detail: this.behind ? 'counting' : 'counted' }
  }
}
