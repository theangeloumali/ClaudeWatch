import type { SessionRef, SourceHealth, SubagentRef } from '../shared/office/types'
import { ORCA_CLI } from '../shared/orca-bundle'
import { POWERSHELL, powershellArgs, programName } from '../shared/platform-process'
import {
  ancestry,
  consoleRootScript,
  parseConsoleRoot,
  parseProcessList,
  PROCESS_LIST_SCRIPT,
  type ProcessNode,
  type ProcessTree,
  type RunScript
} from '../shared/windows-console'
import { type BridgeIo, jsonObject, object } from './io'

export interface OrcaEnvironment {
  paneKey: string | null
  worktreeId: string | null
  jobDir: string | null
}
// Only these three keys survive; everything else in the text is dropped.
export function parseOrcaEnvironment(environment: string): OrcaEnvironment {
  const filtered: OrcaEnvironment = { paneKey: null, worktreeId: null, jobDir: null }
  const pattern = /(?:^|\s)(ORCA_PANE_KEY|ORCA_WORKTREE_ID|CLAUDE_JOB_DIR)=([^\s]*)/g
  for (const match of environment.matchAll(pattern)) {
    const value = match[2] || null
    if (match[1] === 'ORCA_PANE_KEY') filtered.paneKey = value
    if (match[1] === 'ORCA_WORKTREE_ID') filtered.worktreeId = value
    if (match[1] === 'CLAUDE_JOB_DIR') filtered.jobDir = value
  }
  if (filtered.jobDir) {
    filtered.paneKey = null
    filtered.worktreeId = null
  }
  return filtered
}

// `ps -E` prints the arguments and then the environment with nothing to tell them apart, so
// the arguments are read alone first and only what follows them is parsed. Still a hint, not
// proof: a process can rewrite its own environment.
export async function readOrcaEnvironment(
  pid: number,
  ps: (args: string[]) => Promise<string>
): Promise<OrcaEnvironment> {
  const argv = (await ps(['-o', 'command=', '-p', String(pid)])).trim()
  const listing = (await ps(['-E', '-o', 'command=', '-p', String(pid)])).trim()
  const environment = listing.slice(argv.length)
  if (!argv || !listing.startsWith(argv) || !/^(\s|$)/.test(environment))
    throw new Error('process arguments changed between reads')
  return parseOrcaEnvironment(environment)
}

// How a process is looked up: `exec` runs ps or the Orca CLI, `treeOf` reads Windows' tree.
interface OrcaLookup {
  exec: (file: string, args: string[]) => Promise<string>
  treeOf: (pid: number) => Promise<ProcessTree>
  platform: NodeJS.Platform
}
const NOT_IN_ORCA: OrcaEnvironment = { paneKey: null, worktreeId: null, jobDir: null }

// `orca diagnostics memory` names each pane's first process: its shell.
function panesByShell(diagnostics: string): Map<number, string> {
  const envelope = jsonObject(diagnostics)
  // A failed listing says nothing about panes: it must not be remembered as "none".
  if (envelope?.ok !== true) throw new Error('Orca did not list its panes')
  const panes = new Map<number, string>()
  const worktrees = object(envelope.result)?.worktrees
  for (const worktree of Array.isArray(worktrees) ? worktrees : []) {
    const sessions = object(worktree)?.sessions
    for (const pane of Array.isArray(sessions) ? sessions.map(object) : []) {
      if (Number.isSafeInteger(pane?.pid) && typeof pane?.paneKey === 'string')
        panes.set(Number(pane.pid), pane.paneKey)
    }
  }
  return panes
}

// Windows lets no process read another's environment, so the pane is the one whose shell is
// this process's ancestor. Orca, and its signature check, are asked only when an Orca process
// is one: for any other session they would cost seconds and say nothing.
async function readWindowsPaneKey(
  pid: number,
  { exec, treeOf }: OrcaLookup
): Promise<string | null> {
  const chain = ancestry(await treeOf(pid), pid)
  // Read before the process showed up: not proof that it runs outside Orca.
  if (!chain.length) throw new Error('process not listed yet')
  if (!chain.some((node) => programName(node.name) === 'orca')) return null
  const panes = panesByShell(await exec(ORCA_CLI, ['diagnostics', 'memory', '--json']))
  const shell = chain.find((node) => panes.has(node.pid))
  return shell ? (panes.get(shell.pid) ?? null) : null
}

// Where a process's Orca identifiers come from: its environment, or on Windows Orca's listing.
export async function orcaEnvironmentOf(pid: number, lookup: OrcaLookup): Promise<OrcaEnvironment> {
  if (lookup.platform !== 'win32')
    return readOrcaEnvironment(pid, (args) => lookup.exec('/bin/ps', args))
  return { ...NOT_IN_ORCA, paneKey: await readWindowsPaneKey(pid, lookup) }
}

const isTeammate = (agent: SubagentRef): boolean => agent.kind === 'teammate'

// A child agent started inside a pane inherits its parent's pane key. The pane belongs to the
// earliest session or teammate; the others keep their host but cannot be driven through it.
export function claimPanes(sessions: SessionRef[]): SessionRef[] {
  const owners = new Map<string, SessionRef | SubagentRef>()
  const claim = (holder: SessionRef | SubagentRef): void => {
    if (!holder.orcaPaneKey) return
    const owner = owners.get(holder.orcaPaneKey)
    if (!owner || (holder.startedAtMs ?? Infinity) < (owner.startedAtMs ?? Infinity))
      owners.set(holder.orcaPaneKey, holder)
  }
  // Sessions claim first, so a teammate never wins a tie against a session.
  sessions.forEach(claim)
  for (const session of sessions) session.subagents.filter(isTeammate).forEach(claim)
  const owns = (holder: SessionRef | SubagentRef): boolean =>
    !holder.orcaPaneKey || owners.get(holder.orcaPaneKey) === holder
  return sessions.map((session) =>
    owns(session) && session.subagents.every(owns)
      ? session
      : {
          ...session,
          orcaPaneKey: owns(session) ? session.orcaPaneKey : null,
          subagents: session.subagents.map((agent) =>
            owns(agent) ? agent : { ...agent, orcaPaneKey: null }
          )
        }
  )
}

// Each ask verifies Orca's whole bundle first (about 1.3 CPU-seconds), so a healthy Orca is
// asked every five minutes. A failing one is retried sooner, backing off to once a minute, and
// at once when a session shows a pane key: Orca is then running.
const HEALTHY_POLL_MS = 5 * 60_000
const FIRST_RETRY_MS = 10_000
const MAX_RETRY_MS = 60_000

export class OrcaSource {
  private nextPoll = 0
  private delay = FIRST_RETRY_MS
  private health: SourceHealth = { id: 'orca', ok: true, detail: 'not polled' }
  private environments = new Map<string, { value: OrcaEnvironment; retryAt: number }>()
  // One enumeration of every process serves all of a tick's new sessions.
  private listing: { now: number; processes: Promise<Map<number, ProcessNode>> } | null = null
  constructor(
    private readonly io: BridgeIo,
    private readonly platform: NodeJS.Platform = process.platform,
    // The process tree compiles a helper on a fresh host's first run, past the 5 s default.
    private readonly runScript: RunScript = (script) =>
      io.exec(POWERSHELL, powershellArgs(script), { timeoutMs: 20_000 })
  ) {}

  async poll(now: number): Promise<SourceHealth> {
    if (now < this.nextPoll) return { ...this.health }
    try {
      await this.io.stat(ORCA_CLI)
      const response = jsonObject(await this.io.exec(ORCA_CLI, ['worktree', 'ps', '--json']))
      if (!response || response.ok === false) throw new Error('invalid response')
      this.health = { id: 'orca', ok: true, detail: 'available' }
      this.delay = FIRST_RETRY_MS
      this.nextPoll = now + HEALTHY_POLL_MS
    } catch {
      this.health = { id: 'orca', ok: false, detail: 'unavailable' }
      this.nextPoll = now + this.delay
      this.delay = Math.min(this.delay * 2, MAX_RETRY_MS)
    }
    return { ...this.health }
  }

  prune(sessions: SessionRef[]): void {
    const live = new Set(
      sessions.flatMap((session) => [
        `${session.pid}:${session.startedAtMs}`,
        ...session.subagents.filter(isTeammate).map((t) => `${t.pid}:${t.startedAtMs}`)
      ])
    )
    for (const identity of this.environments.keys()) {
      if (!live.has(identity)) this.environments.delete(identity)
    }
  }

  async enrich(session: SessionRef, now = Date.now()): Promise<SessionRef> {
    if (session.provider === 'codex' || session.pid === null) return session
    const environment = await this.environment(session.pid, session.startedAtMs, now)
    const enriched: SessionRef = {
      ...session,
      host: environment.paneKey ? 'orca' : session.host,
      orcaPaneKey: environment.paneKey
    }
    if (!session.subagents.some(isTeammate)) return enriched
    // A teammate is its own process in its own pane, so its key is read from its own environment.
    const subagents = await Promise.all(
      session.subagents.map(async (agent) =>
        isTeammate(agent) && typeof agent.pid === 'number'
          ? {
              ...agent,
              orcaPaneKey: (await this.environment(agent.pid, agent.startedAtMs, now)).paneKey
            }
          : agent
      )
    )
    return { ...enriched, subagents }
  }

  private async environment(
    pid: number,
    startedAtMs: number | undefined,
    now: number
  ): Promise<OrcaEnvironment> {
    const identity = `${pid}:${startedAtMs}`
    let cached = this.environments.get(identity)
    if (!cached || now >= cached.retryAt) {
      try {
        const value = await orcaEnvironmentOf(pid, {
          exec: (file, args) => this.io.exec(file, args),
          treeOf: (treePid) => this.treeAt(treePid, now),
          platform: this.platform
        })
        cached = { value, retryAt: Infinity }
        if (value.paneKey && !this.health.ok) this.nextPoll = 0
      } catch {
        cached = { value: NOT_IN_ORCA, retryAt: now + 30000 }
      }
      this.environments.set(identity, cached)
    }
    return cached.value
  }

  private async treeAt(pid: number, now: number): Promise<ProcessTree> {
    if (this.listing?.now !== now) {
      this.listing = { now, processes: this.runScript(PROCESS_LIST_SCRIPT).then(parseProcessList) }
    }
    const [processes, consoleRoot] = await Promise.all([
      this.listing.processes,
      this.runScript(consoleRootScript(pid)).then(parseConsoleRoot)
    ])
    return { consoleRoot, processes }
  }
}
