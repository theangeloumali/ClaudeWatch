import { join } from 'node:path'
import { isAbsoluteFolder } from '../shared/platform-process'
import type { AgentActivity, SubagentRef } from '../shared/office/types'
import { type BridgeIo, isLabel, isMissing, jsonObject, object } from './io'
import type { ProcessRow } from './process-table'
import { listAgentFiles } from './subagents'
import { newestTeammateTranscripts, type TranscriptFile } from './teammate-transcripts'
import { toolActivity } from './tool-category'
import { projectSlug, readTranscript } from './transcript-tail'

export interface TeammateProcess {
  pid: number
  startedAtMs: number
  agentId: string
  parentSessionId: string
}

export interface Teammate {
  ref: SubagentRef
  // Its own transcript, then those of the agents it spawned; empty while none can be tied.
  transcripts: string[]
}

interface LiveMember {
  identity: string
  agentId: string
  name: string
  agentType: string
  cwd: string | null
  joinedAtMs: number
  process: TeammateProcess
}

const NAME = /^[\w.-]{1,64}$/
const FIRST_SEARCH_DELAY_MS = 10_000
const MAX_SEARCH_DELAY_MS = 5 * 60_000
const FRESH_MS = 60000

// A teammate is its own process, started with the agent id and its lead's session id as flags.
export function teammateProcesses(rows: ProcessRow[]): TeammateProcess[] {
  const teammates: TeammateProcess[] = []
  for (const { pid, startedAtMs, argv } of rows) {
    const flagValue = (flag: string): string | undefined =>
      argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined
    const agentId = flagValue('--agent-id')
    const parentSessionId = flagValue('--parent-session-id')
    if (agentId && parentSessionId) teammates.push({ pid, startedAtMs, agentId, parentSessionId })
  }
  return teammates
}

export class TeammateSource {
  private transcripts = new Map<string, string>()
  // When each teammate's folder is next searched, and how long that wait was.
  private searches = new Map<string, { againAt: number; delayMs: number }>()
  private seen = new Set<string>()

  constructor(
    private readonly io: BridgeIo,
    private readonly platform: NodeJS.Platform = process.platform
  ) {}

  // Teammates write no registry file: the roster names them and the process table proves
  // which are alive. `processes` is asked only when the session leads a team. `leadCwd` is
  // where a member works when its roster entry names no folder; null when the lead is gone.
  async collect(
    root: string,
    leadSessionId: string,
    leadCwd: string | null,
    processes: () => Promise<TeammateProcess[]>,
    now: number
  ): Promise<Teammate[]> {
    const team = `session-${leadSessionId.slice(0, 8)}`
    let roster: Record<string, unknown> | null
    try {
      roster = jsonObject(await this.io.readText(join(root, 'teams', team, 'config.json')))
    } catch (error) {
      if (isMissing(error)) return []
      throw error
    }
    // Eight characters can collide, so the roster must name this lead in full.
    if (roster?.leadSessionId !== leadSessionId || !Array.isArray(roster.members)) return []
    const live = (await processes()).filter((p) => p.parentSessionId === leadSessionId)
    const members = roster.members
      .flatMap((value) => this.liveMember(root, team, object(value), live))
      .sort((a, b) => a.agentId.localeCompare(b.agentId))
    await this.tieTranscripts(root, team, members, leadCwd, now)
    const teammates: Teammate[] = []
    for (const member of members) {
      const activity = await this.activity(member.identity, now)
      const own = this.transcripts.get(member.identity)
      const spawned = own ? await listAgentFiles(own, this.io) : []
      teammates.push({
        transcripts: own ? [own, ...spawned.map((file) => file.path)] : [],
        ref: {
          id: member.agentId,
          type: member.agentType,
          activity,
          kind: 'teammate',
          name: member.name,
          ...(member.cwd && { cwd: member.cwd }),
          pid: member.process.pid,
          startedAtMs: member.process.startedAtMs,
          orcaPaneKey: null,
          tokens: null
        }
      })
    }
    return teammates
  }

  // Drops what is remembered about teammates not seen since the last call.
  prune(): void {
    for (const identity of this.transcripts.keys())
      if (!this.seen.has(identity)) this.transcripts.delete(identity)
    for (const identity of this.searches.keys())
      if (!this.seen.has(identity)) this.searches.delete(identity)
    this.seen.clear()
  }

  private liveMember(
    root: string,
    team: string,
    member: Record<string, unknown> | null,
    live: TeammateProcess[]
  ): LiveMember[] {
    if (!member || typeof member.name !== 'string' || !NAME.test(member.name)) return []
    // The id is the name and the team, so nothing can show one agent under another's name.
    const agentId = `${member.name}@${team}`
    const process = live.find((p) => p.agentId === agentId)
    if (!process || member.agentId !== agentId || !isLabel(member.agentType)) return []
    const identity = `${root}\n${agentId}\n${process.pid}:${process.startedAtMs}`
    this.seen.add(identity)
    return [
      {
        identity,
        agentId,
        name: member.name,
        agentType: member.agentType,
        cwd:
          typeof member.cwd === 'string' && isAbsoluteFolder(member.cwd, this.platform)
            ? member.cwd
            : null,
        joinedAtMs: typeof member.joinedAt === 'number' ? member.joinedAt : 0,
        process
      }
    ]
  }

  // Ties each member to the newest transcript that names it and was written since it joined.
  // A tied member is looked for again too: a re-spawn under its name starts a new transcript.
  private async tieTranscripts(
    root: string,
    team: string,
    members: LiveMember[],
    leadCwd: string | null,
    now: number
  ): Promise<void> {
    const wantedIn = new Map<string, LiveMember[]>()
    for (const member of members) {
      const cwd = member.cwd ?? leadCwd
      if (!cwd || now < (this.searches.get(member.identity)?.againAt ?? 0)) continue
      const folder = join(root, 'projects', projectSlug(cwd))
      wantedIn.set(folder, [...(wantedIn.get(folder) ?? []), member])
    }
    for (const [folder, wanted] of wantedIn) {
      const newest = await newestTeammateTranscripts(
        folder,
        team,
        new Set(wanted.map((member) => member.name)),
        Math.min(...wanted.map((member) => member.joinedAtMs)),
        this.io
        // An unreadable folder leaves its teammates untied; they still show, as thinking.
      ).catch(() => new Map<string, TranscriptFile>())
      for (const member of wanted) {
        const found = newest.get(member.name)
        const isNewTie =
          found !== undefined &&
          found.mtimeMs >= member.joinedAtMs &&
          found.path !== this.transcripts.get(member.identity)
        if (isNewTie) this.transcripts.set(member.identity, found.path)
        this.searchLater(member.identity, now, isNewTie)
      }
    }
  }

  // Each search reads transcript heads, so one that changes nothing doubles the wait.
  private searchLater(identity: string, now: number, startOver: boolean): void {
    const waited = this.searches.get(identity)?.delayMs
    const delayMs =
      startOver || waited === undefined
        ? FIRST_SEARCH_DELAY_MS
        : Math.min(waited * 2, MAX_SEARCH_DELAY_MS)
    this.searches.set(identity, { againAt: now + delayMs, delayMs })
  }

  // A teammate has no registry status: an unfinished tool shows as that tool, a transcript
  // written in the last minute as thinking, anything older as idle.
  private async activity(identity: string, now: number): Promise<AgentActivity> {
    const path = this.transcripts.get(identity)
    if (!path) return 'thinking'
    try {
      const { tool, mtimeMs } = await readTranscript(path, this.io)
      if (tool) return toolActivity(tool.category)
      return now - mtimeMs < FRESH_MS ? 'thinking' : 'idle'
    } catch {
      // The transcript went away or cannot be read: look for it again, soon.
      this.transcripts.delete(identity)
      this.searchLater(identity, now, true)
      return 'thinking'
    }
  }
}
