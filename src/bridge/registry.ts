const STATUSES = ['busy', 'idle', 'waiting', 'shell'] as const
type RegistryStatus = (typeof STATUSES)[number]
const isStatus = (value: unknown): value is RegistryStatus =>
  STATUSES.some((status) => status === value)
const SESSION_ID = /^[\w-]+$/

export interface RegistryEntry {
  pid: number
  sessionId: string
  cwd: string
  name: string
  status: RegistryStatus
  waitingFor: string
  procStart: string
  updatedAtMs: number
}

import { join } from 'node:path'
import { isAbsoluteFolder } from '../shared/platform-process'
import type { SessionRef, SourceHealth } from '../shared/office/types'
import { type BridgeIo, isMissing, jsonObject } from './io'
import { forgetGoneExcept, liveStartedAt } from './liveness'
import { sessionFromRegistry, sessionFromTeammate } from './claude'
import { resolveProject } from './project-root'
import { pruneTranscripts, readTranscript, transcriptPath } from './transcript-tail'
import { listAgentFiles, liveSubagents } from './subagents'
import { type ProcessRow, readProcessTable } from './process-table'
import { type Teammate, type TeammateProcess, teammateProcesses, TeammateSource } from './teammates'
import type { SessionFiles } from './usage-tracker'

export function parseRegistry(
  text: string,
  platform: NodeJS.Platform = process.platform
): RegistryEntry | null {
  const record = jsonObject(text)
  if (
    !record ||
    typeof record.pid !== 'number' ||
    !Number.isSafeInteger(record.pid) ||
    record.pid <= 0 ||
    typeof record.sessionId !== 'string' ||
    !SESSION_ID.test(record.sessionId) ||
    typeof record.cwd !== 'string' ||
    !isAbsoluteFolder(record.cwd, platform) ||
    typeof record.procStart !== 'string' ||
    !isStatus(record.status)
  )
    return null
  const stamp = record.statusUpdatedAt ?? record.updatedAt
  const updatedAtMs =
    typeof stamp === 'number' ? stamp : typeof stamp === 'string' ? Date.parse(stamp) : 0
  return {
    pid: record.pid,
    sessionId: record.sessionId,
    cwd: record.cwd,
    name: typeof record.name === 'string' ? record.name : '',
    status: record.status,
    waitingFor: typeof record.waitingFor === 'string' ? record.waitingFor : '',
    procStart: record.procStart,
    updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : 0
  }
}

export interface ClaudeBatch {
  sessions: SessionRef[]
  sources: SourceHealth[]
  // The transcripts behind each session, by session key, for the token counters.
  transcripts: Map<string, SessionFiles>
}

interface Collected {
  session: SessionRef
  files: SessionFiles | null
  hasTeam: boolean
}

// The records each root showed live last tick, so one PowerShell cannot vouch for this tick is
// kept rather than dropped: the robot would otherwise leave its desk and come back.
const liveLastTick = new WeakMap<BridgeIo, Map<string, Map<string, number>>>()
const recordOf = ({ pid, procStart, sessionId }: RegistryEntry): string =>
  `${pid}:${procStart}:${sessionId}`

export async function collectClaude(
  roots: string[],
  io: BridgeIo,
  now: number,
  teamSource?: TeammateSource,
  readProcesses = (): Promise<ProcessRow[]> => readProcessTable(io, platform),
  // The platform that wrote the registry; the host's own unless a test says otherwise.
  platform: NodeJS.Platform = process.platform
): Promise<ClaudeBatch> {
  const teammates = teamSource ?? new TeammateSource(io, platform)
  const sessions: SessionRef[] = []
  const sources: SourceHealth[] = []
  const transcripts = new Map<string, SessionFiles>()
  // Read at most once per tick.
  let processTable: Promise<ProcessRow[]> | undefined
  const table = (): Promise<ProcessRow[]> => (processTable ??= readProcesses())
  let teammateTable: Promise<TeammateProcess[]> | undefined
  const processes = (): Promise<TeammateProcess[]> =>
    (teammateTable ??= table().then(teammateProcesses))
  const uniqueRoots = [...new Set(roots)]
  const liveSessionIds = new Set<string>()
  // One live entry as a session, with its agents, its team and the transcripts behind them.
  const collectSession = async (
    root: string,
    entry: RegistryEntry,
    startedAtMs: number
  ): Promise<Collected> => {
    const project = await resolveProject(entry.cwd, io, now, platform)
    const path = await transcriptPath(root, entry.cwd, entry.sessionId, io)
    const transcript = path ? await readTranscript(path, io) : { tool: null, error: false }
    const agentFiles = path ? await listAgentFiles(path, io) : []
    const agents = await liveSubagents(agentFiles, io, now)
    // A team that cannot be read costs the lead its teammates, never the lead itself.
    const team = await teammates
      .collect(root, entry.sessionId, entry.cwd, processes, now)
      .catch(() => null)
    const session = sessionFromRegistry(
      entry,
      transcript,
      [...agents, ...(team ?? []).map((teammate) => teammate.ref)],
      project.root,
      project.worktree,
      startedAtMs
    )
    const teamTranscripts = (team ?? []).map((teammate): [string, string[]] => [
      teammate.ref.id,
      teammate.transcripts
    ])
    return {
      session,
      hasTeam: team !== null,
      files: path ? { main: path, agents: agentFiles, teammates: new Map(teamTranscripts) } : null
    }
  }
  // A vanished file drops the session for this tick; anything else is a failed read.
  const settled = (error: unknown): 'failed' | null => (isMissing(error) ? null : 'failed')
  let lastTick = liveLastTick.get(io)
  if (!lastTick) liveLastTick.set(io, (lastTick = new Map()))
  const entries: RegistryEntry[] = []
  for (const root of uniqueRoots) {
    const health: SourceHealth = { id: `claude:${root}`, ok: true, detail: 'empty' }
    const wasLive = lastTick.get(root) ?? new Map<string, number>()
    const isLiveNow = new Map<string, number>()
    let isUnvouched = false
    try {
      const files = await io.list(join(root, 'sessions'))
      // Liveness is proven one entry at a time, so at most one `ps` runs at once. Each live
      // session is then read while the next is being proven, and listed in file order.
      const reads: Promise<Collected | 'failed' | null>[] = []
      for (const file of files.filter((name) => /^\d+\.json$/.test(name))) {
        try {
          const entry = parseRegistry(await io.readText(join(root, 'sessions', file)), platform)
          if (!entry) continue
          entries.push(entry)
          // An unreadable table proves nothing either way: each pid is then asked about.
          const rows = await table().catch(() => [])
          const record = recordOf(entry)
          const startedAtMs = await liveStartedAt(entry, io, rows, platform).catch(
            (error: unknown) => {
              const known = wasLive.get(record)
              if (known === undefined) throw error
              isUnvouched = true
              return known
            }
          )
          if (startedAtMs === null) continue
          isLiveNow.set(record, startedAtMs)
          liveSessionIds.add(entry.sessionId)
          reads.push(collectSession(root, entry, startedAtMs).catch(settled))
        } catch (error) {
          reads.push(Promise.resolve(settled(error)))
        }
      }
      for (const read of await Promise.all(reads)) {
        if (read === null) continue
        if (read === 'failed') {
          health.ok = false
          health.detail = 'session read failed'
          continue
        }
        sessions.push(read.session)
        if (read.files) transcripts.set(read.session.key, read.files)
        if (health.ok) health.detail = 'live'
        if (!read.hasTeam) {
          health.ok = false
          health.detail = 'team read failed'
        }
      }
      if (isUnvouched && health.ok) {
        health.ok = false
        health.detail = 'liveness unknown'
      }
    } catch (error) {
      if (!isMissing(error)) {
        health.ok = false
        health.detail = 'registry read failed'
      }
    }
    lastTick.set(root, isLiveNow)
    sources.push(health)
  }
  forgetGoneExcept(io, entries)
  // Who has no lead cannot be told while a registry is unread: it may hold the lead.
  if (sources.every((source) => source.ok)) {
    const parents = (await processes().catch(() => [])).map((p) => p.parentSessionId)
    for (const leadSessionId of new Set(parents)) {
      if (liveSessionIds.has(leadSessionId) || !SESSION_ID.test(leadSessionId)) continue
      for (const root of uniqueRoots) {
        const orphans = await teammates
          .collect(root, leadSessionId, null, processes, now)
          .catch(() => [])
        for (const orphan of orphans) {
          const files = await orphanSession(orphan, io, now, platform).catch(() => null)
          if (!files) continue
          sessions.push(files.session)
          if (files.transcripts) transcripts.set(files.session.key, files.transcripts)
        }
      }
    }
  }
  teammates.prune()
  pruneTranscripts(io)
  return { sessions, sources, transcripts }
}

// A teammate outlives its lead when the lead exits first. It still runs in its own process
// and pane, so it is shown as a session of its own until it exits too.
async function orphanSession(
  { ref, transcripts: [main] }: Teammate,
  io: BridgeIo,
  now: number,
  platform: NodeJS.Platform
): Promise<{ session: SessionRef; transcripts: SessionFiles | null } | null> {
  const { cwd, pid } = ref
  if (!cwd || typeof pid !== 'number') return null
  const project = await resolveProject(cwd, io, now, platform)
  return {
    session: sessionFromTeammate({ ...ref, cwd, pid }, project.root, project.worktree),
    transcripts: main
      ? { main, agents: await listAgentFiles(main, io), teammates: new Map() }
      : null
  }
}
