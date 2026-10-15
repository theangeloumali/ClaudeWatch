import { join, win32 } from 'node:path'
import { UNSAFE_IN_A_NAME } from '../shared/unsafe-text'
import { OBSERVATION_STALE_AFTER_MS } from '../shared/office/observation'
import type {
  SelectedModelRef,
  SessionRef,
  SourceHealth,
  SubagentRef,
  TokenCounts
} from '../shared/office/types'
import { zeroCounts } from '../shared/office/token-counts'
import {
  claimFolders,
  isAppFolder,
  isFolderPath,
  unplacedConversations,
  type WrittenConversation
} from './process-folders'
import { type BridgeIo, displayName, folderName, isLabel } from './io'
import { type Answers, readOrRecall } from './opencode-answers'
import {
  OPENCODE_IDLE,
  isOpencodeService,
  opencodeProcesses,
  opencodeState,
  type OpencodeState
} from './opencode-activity'
import {
  OpencodeDbError,
  type OpencodeFailure,
  type OpencodeQuery,
  type OpencodeRow
} from './opencode-db'
import {
  forgetExited,
  identityOf,
  keyOf,
  newestFirst,
  placeholderId,
  type ProcessRow,
  readProcessTable,
  rememberedFolder,
  type SessionOwner
} from './process-table'
import { discoverV2Roots, MAX_V2_LIVE_ROOTS, withoutV2Models } from './opencode-v2-db'
import { placementOf, resolveProject } from './project-root'
import { isStillWorking, OPEN_TOOL_HOLD_MS, quietFor, SUBAGENT_FRESH_MS } from './liveness'
import { toolActivity } from './tool-category'
import { tokenCount } from './usage-fold'

const FAILURE_DETAIL: Record<OpencodeFailure, string> = {
  missing: 'OpenCode is running but its database was not found',
  busy: 'OpenCode database is busy',
  changed: 'OpenCode database has a shape this version cannot read',
  unreadable: 'OpenCode database could not be read',
  malformed: 'OpenCode session data could not be read'
}
const SESSION_ID = /^[\w-]{1,128}$/

// Input excludes what was read from or written to the cache, and output excludes reasoning:
// the five columns add up to the session's total.
function countsOf(row: OpencodeRow): TokenCounts {
  return {
    input: tokenCount(row.tokens_input),
    output: tokenCount(row.tokens_output) + tokenCount(row.tokens_reasoning),
    cacheWrite: tokenCount(row.tokens_cache_write),
    cacheRead: tokenCount(row.tokens_cache_read)
  }
}

// Model IDs may be provider-qualified; keep the existing length and unsafe-text limits.
function isModelLabel(label: unknown): label is string {
  return (
    typeof label === 'string' &&
    isLabel(label.replaceAll('/', '-')) &&
    !UNSAFE_IN_A_NAME.test(label)
  )
}

function selectedModelOf(row: OpencodeRow): SelectedModelRef | null {
  const providerId = row.model_provider_id
  const modelId = row.model_id
  const variant = row.model_variant
  if (!isModelLabel(providerId) || !isModelLabel(modelId)) return null
  return { providerId, modelId, ...(isModelLabel(variant) && { variant }) }
}

interface SessionRow extends Pick<SessionRef, 'selectedModel'> {
  id: string
  title: string
  createdAtMs: number | null
  updatedAtMs: number
  counts: TokenCounts
  cwd?: string
}
// A row of the wrong shape is no session at all.
function sessionRow(
  row: OpencodeRow,
  platform: NodeJS.Platform = process.platform
): SessionRow | null {
  if (typeof row.id !== 'string' || !SESSION_ID.test(row.id)) return null
  if (typeof row.time_updated !== 'number' || !Number.isFinite(row.time_updated)) return null
  const selectedModel = selectedModelOf(row)
  return {
    id: row.id,
    title: typeof row.title === 'string' ? displayName(row.title) : '',
    createdAtMs:
      typeof row.time_created === 'number' && Number.isFinite(row.time_created)
        ? row.time_created
        : null,
    updatedAtMs: row.time_updated,
    counts: countsOf(row),
    ...(selectedModel && { selectedModel }),
    ...(typeof row.directory === 'string' &&
      isFolderPath(row.directory, platform) && { cwd: row.directory })
  }
}

// What a session's newest message says it is doing.
function stateOf(query: OpencodeQuery, sessionId: string, now: number): OpencodeState {
  const [message] = query('newestMessage', sessionId)
  const parts = typeof message?.id === 'string' ? query('messageParts', message.id, sessionId) : []
  return opencodeState(message, parts, now)
}

// A child session written within the last minute is an agent still at work. Its row is written
// as a step ends, not while a tool runs, so a quiet one is held while its newest tool is open.
function subagentOf(query: OpencodeQuery, row: OpencodeRow, now: number): SubagentRef | null {
  if (typeof row.id !== 'string' || !SESSION_ID.test(row.id)) return null
  if (typeof row.time_updated !== 'number') return null
  const quietMs = quietFor(now, row.time_updated)
  if (quietMs === null || quietMs >= OPEN_TOOL_HOLD_MS) return null
  const state = stateOf(query, row.id, now)
  const needsAnswer = state.attention === 'question' || state.attention === 'permission'
  if (state.activity === 'idle' && !needsAnswer && query('newestMessage', row.id).length)
    return null
  const tool = quietMs < SUBAGENT_FRESH_MS ? null : state.currentTool
  if (!isStillWorking(quietMs, SUBAGENT_FRESH_MS, tool !== null || needsAnswer)) return null
  return {
    id: row.id,
    type: isLabel(row.agent) ? row.agent : 'subagent',
    ...(isLabel(row.agent) && { name: row.agent }),
    kind: 'subagent',
    pid: null,
    orcaPaneKey: null,
    activity: needsAnswer
      ? 'idle'
      : state.currentTool
        ? toolActivity(state.currentTool.category)
        : 'thinking',
    tokens: countsOf(row),
    currentTool: state.currentTool,
    attention: state.attention,
    observation: {
      sourceId: 'opencode',
      observedAtMs: now,
      staleAfterMs: OBSERVATION_STALE_AFTER_MS,
      coverage: 'own'
    }
  }
}

interface Conversation {
  session: SessionRow
  state: OpencodeState
  subagents: SubagentRef[]
}
type OpencodeProcess = ReturnType<typeof opencodeProcesses>[number]
// A session shown before its process can be told apart has no process: its pid is null.
type AgentProcess = SessionOwner & { cwd: string }

type RecentSession = WrittenConversation & { id: string }
// Places the Windows processes still waiting for a folder, from the root sessions written since
// the first of them started, and returns those sessions.
function claimOpencodeFolders(
  query: OpencodeQuery,
  agents: OpencodeProcess[],
  folders: Map<string, string>
): RecentSession[] {
  const waiting = agents.filter((process) => !folders.has(identityOf(process)))
  if (!waiting.length) return []
  const since = Math.min(...waiting.map(({ startedAtMs }) => startedAtMs))
  const sessions = query('recentRootSessions', since).flatMap((row) => {
    const { id, directory, time_created: createdAtMs, time_updated: writtenAtMs } = row
    if (typeof id !== 'string' || typeof directory !== 'string') return []
    if (typeof writtenAtMs !== 'number') return []
    if (!isFolderPath(directory, 'win32') || isAppFolder(directory, 'win32')) return []
    const created = typeof createdAtMs === 'number' ? createdAtMs : null
    return [{ id, folder: directory, createdAtMs: created, writtenAtMs }]
  })
  claimFolders(agents, folders, sessions)
  return sessions
}

function v2StateOf(
  query: OpencodeQuery,
  row: OpencodeRow,
  now: number
): OpencodeState & { updatedAtMs: number } {
  const updatedAtMs = typeof row.time_updated === 'number' ? row.time_updated : 0
  if (typeof row.id !== 'string') return { ...OPENCODE_IDLE, updatedAtMs }
  const [message] = query('v2NewestMessage', row.id)
  if (!message) return { ...OPENCODE_IDLE, updatedAtMs }
  const state = opencodeState(message, query('v2MessageParts', row.id), now)
  const lastWrite =
    typeof message.time_updated === 'number' ? message.time_updated : message.time_created
  // V2 streams message updates without touching the session row on every chunk.
  const observedWrite =
    typeof lastWrite === 'number' ? Math.max(updatedAtMs, lastWrite) : updatedAtMs
  if (
    typeof row.time_idle === 'number' &&
    typeof lastWrite === 'number' &&
    row.time_idle >= lastWrite
  ) {
    return {
      ...opencodeState({ role: 'idle', outcome: row.idle_outcome }, [], now),
      updatedAtMs: observedWrite
    }
  }
  return { ...state, updatedAtMs: observedWrite }
}

const MAX_CHILDREN = 64
const MAX_CHILD_DEPTH = 4

function v2Children(query: OpencodeQuery, rootId: string, now: number): SubagentRef[] {
  const subagents: SubagentRef[] = []
  const visited = new Set<string>([rootId])
  const pending = [{ id: rootId, depth: 0 }]
  let inspected = 0
  for (const parent of pending) {
    if (parent.depth >= MAX_CHILD_DEPTH || inspected >= MAX_CHILDREN) continue
    for (const row of query('v2ChildSessions', parent.id)) {
      if (inspected++ >= MAX_CHILDREN) break
      const session = sessionRow(row)
      if (!session || visited.has(session.id)) continue
      visited.add(session.id)
      pending.push({ id: session.id, depth: parent.depth + 1 })
      const state = v2StateOf(query, row, now)
      const quietMs = quietFor(now, state.updatedAtMs)
      if (quietMs === null || state.attention === 'done' || state.attention === 'error') continue
      const needsAnswer = state.attention === 'question' || state.attention === 'permission'
      const isWorking = state.activity !== 'idle' || needsAnswer
      if (
        !isWorking ||
        !isStillWorking(quietMs, SUBAGENT_FRESH_MS, state.currentTool !== null || needsAnswer)
      )
        continue
      subagents.push({
        id: session.id,
        type: isLabel(row.agent) ? row.agent : 'subagent',
        ...(isLabel(row.agent) && { name: row.agent }),
        kind: 'subagent',
        pid: null,
        orcaPaneKey: null,
        ...state,
        tokens: session.counts,
        ...(session.selectedModel && { selectedModel: session.selectedModel }),
        observation: {
          sourceId: 'opencode',
          observedAtMs: now,
          staleAfterMs: OBSERVATION_STALE_AFTER_MS,
          coverage: 'own'
        }
      })
    }
  }
  return subagents
}

function readV2Conversations(
  query: OpencodeQuery,
  options: {
    now: number
    retainedRootIds: readonly string[]
    onMalformed: () => void
    platform: NodeJS.Platform
  }
): Conversation[] {
  const { now, onMalformed, platform } = options
  return discoverV2Roots(query, options)
    .flatMap((row) => {
      try {
        const session = sessionRow(row, platform)
        if (!session?.cwd || isAppFolder(session.cwd, platform)) return []
        const state = v2StateOf(query, row, now)
        const subagents = v2Children(query, session.id, now)
        const quietMs = quietFor(now, state.updatedAtMs)
        const needsAnswer = state.attention === 'question' || state.attention === 'permission'
        const isWorking = state.activity !== 'idle' || needsAnswer
        const isLive =
          quietMs !== null &&
          isWorking &&
          isStillWorking(quietMs, SUBAGENT_FRESH_MS, state.currentTool !== null || needsAnswer)
        return isLive || subagents.length
          ? [{ session: { ...session, updatedAtMs: state.updatedAtMs }, state, subagents }]
          : []
      } catch (error) {
        if (!(error instanceof OpencodeDbError) || error.reason !== 'malformed') throw error
        onMalformed()
        return []
      }
    })
    .slice(0, MAX_V2_LIVE_ROOTS)
}

// The newest session in the process's folder that it can have written: one last touched before
// the process began belongs to an earlier run, and its name and tokens are not this agent's.
function readConversation(
  query: OpencodeQuery,
  process: AgentProcess,
  taken: Set<string>,
  now: number
): Conversation | null {
  const session = query('rootSessions', process.cwd)
    .flatMap((row) => sessionRow(row) ?? [])
    .find(({ id, updatedAtMs }) => updatedAtMs >= process.startedAtMs && !taken.has(id))
  if (!session) return null
  taken.add(session.id)
  return {
    session,
    state: stateOf(query, session.id, now),
    subagents: query('childSessions', session.id).flatMap(
      (row) => subagentOf(query, row, now) ?? []
    )
  }
}

interface Remembered {
  liveRootIds: string[]
  // Where each live process runs, by pid and start time: asking costs an `lsof` run.
  folders: Map<string, string>
  // The placeholder key a process without a session was first shown under, by pid and start time.
  placeholders: Map<string, string>
  // Last tick's rows, for a tick that finds the database and its agents unchanged.
  answers: Answers | null
}
const remembered = new WeakMap<BridgeIo, Remembered>()

// The OpenCode processes that are the owner's agents, each with the folder it runs in.
async function locate(
  io: BridgeIo,
  folders: Map<string, string>,
  processes: OpencodeProcess[],
  health: SourceHealth,
  platform: NodeJS.Platform
): Promise<OpencodeProcess[]> {
  // Windows names no process's folder: each is placed from its sessions, into `folders` too.
  if (platform === 'win32') return processes
  const running: OpencodeProcess[] = []
  for (const process of processes) {
    try {
      const cwd = await rememberedFolder(io, folders, process, platform)
      if (cwd && !isAppFolder(cwd, platform)) running.push(process)
    } catch {
      // It may have exited since the table was read: the others are still shown.
      health.ok = false
      health.detail = 'OpenCode process read failed'
    }
  }
  return running
}

interface OpencodeBatch {
  sessions: SessionRef[]
  sources: SourceHealth[]
}

// `root` is OpenCode's data folder. Nothing in it is opened unless an OpenCode process runs.
export async function collectOpencode(
  root: string,
  io: BridgeIo,
  readProcesses = (): Promise<ProcessRow[]> => readProcessTable(io, platform),
  now = Date.now(),
  platform: NodeJS.Platform = process.platform
): Promise<OpencodeBatch> {
  const health: SourceHealth = { id: 'opencode', ok: true, detail: 'empty' }
  try {
    const rows = await readProcesses()
    const processes = opencodeProcesses(rows)
    const isHosting = rows.some(isOpencodeService)
    let memory = remembered.get(io)
    if (!memory) {
      remembered.set(
        io,
        (memory = { folders: new Map(), placeholders: new Map(), liveRootIds: [], answers: null })
      )
    }
    const { folders, placeholders, liveRootIds } = memory
    forgetExited(processes, folders, placeholders)
    const running = newestFirst(await locate(io, folders, processes, health, platform))
    if (!running.length && !isHosting)
      return {
        sessions: [],
        sources: [
          {
            ...health,
            ...(health.ok && { checkedAtMs: now, staleAfterMs: OBSERVATION_STALE_AFTER_MS })
          }
        ]
      }

    const folderOf = (agent: OpencodeProcess): string | undefined => folders.get(identityOf(agent))
    const agents = running.map((agent) => `${identityOf(agent)}@${folderOf(agent) ?? ''}`).join(',')
    const { result: conversations, answers } = await readOrRecall(
      io,
      join(root, 'opencode.db'),
      agents,
      memory.answers,
      (query) => {
        const [schema] = query('schemaVersion')
        if (schema?.has_live_state === 1) {
          return {
            v2: readV2Conversations(schema.has_model === 0 ? withoutV2Models(query) : query, {
              now,
              retainedRootIds: liveRootIds,
              platform,
              onMalformed: () => {
                health.ok = false
                health.detail = FAILURE_DETAIL.malformed
              }
            }),
            legacy: []
          }
        }
        const taken = new Set<string>()
        const recent = platform === 'win32' ? claimOpencodeFolders(query, running, folders) : []
        const read = (process: AgentProcess) => {
          try {
            return { process, conversation: readConversation(query, process, taken, now) }
          } catch (error) {
            // One session's bad JSON costs that session; anything else is the whole database's.
            if (!(error instanceof OpencodeDbError) || error.reason !== 'malformed') throw error
            health.ok = false
            health.detail = FAILURE_DETAIL.malformed
            return null
          }
        }
        const placed = running.flatMap((agent) => {
          const cwd = folderOf(agent)
          return cwd ? [read({ ...agent, cwd })] : []
        })
        // A session no process can yet be told apart for is shown with none, as it was created.
        const unclaimed = recent.filter(({ id }) => !taken.has(id))
        const unplaced = unplacedConversations(running, folders, unclaimed).map((session) =>
          read({
            pid: null,
            startedAtMs: session.createdAtMs ?? session.writtenAtMs,
            cwd: session.folder
          })
        )
        return { v2: [], legacy: [...placed, ...unplaced] }
      }
    )
    memory.answers = answers
    memory.liveRootIds = conversations.v2.map((conversation) => conversation.session.id)
    const sessions: SessionRef[] = []
    for (const conversation of conversations.v2) {
      const directory = conversation.session.cwd
      if (!directory) continue
      const cwd = platform === 'win32' ? win32.normalize(directory) : directory
      const project = await resolveProject(cwd, io, now, platform)
      // A database directory is not proof of which CLI or server owns this session.
      const owner = {
        pid: null,
        cwd,
        startedAtMs: conversation.session.createdAtMs ?? conversation.session.updatedAtMs
      }
      sessions.push({
        ...sessionOf(
          owner,
          conversation,
          `opencode:${conversation.session.id}`,
          placementOf(project)
        ),
        observation: {
          sourceId: 'opencode',
          observedAtMs: now,
          staleAfterMs: OBSERVATION_STALE_AFTER_MS,
          coverage: 'own'
        }
      })
    }
    for (const found of conversations.legacy) {
      if (!found) continue
      // OpenCode records a Windows folder with forward slashes; the feed shows it as Windows does.
      const cwd = platform === 'win32' ? win32.normalize(found.process.cwd) : found.process.cwd
      const process = { ...found.process, cwd }
      const project = await resolveProject(cwd, io, now, platform)
      const key = keyOf(placeholders, process, 'opencode', found.conversation?.session.id)
      const session = sessionOf(process, found.conversation, key, placementOf(project))
      sessions.push(
        found.conversation
          ? {
              ...session,
              observation: {
                sourceId: 'opencode',
                observedAtMs: now,
                staleAfterMs: OBSERVATION_STALE_AFTER_MS,
                coverage: 'own'
              }
            }
          : session
      )
    }
    if (health.ok) health.detail = 'live'
    return {
      sessions,
      sources: [
        {
          ...health,
          ...(health.ok && { checkedAtMs: now, staleAfterMs: OBSERVATION_STALE_AFTER_MS })
        }
      ]
    }
  } catch (error) {
    health.ok = false
    health.detail =
      error instanceof OpencodeDbError ? FAILURE_DETAIL[error.reason] : 'OpenCode discovery failed'
    return { sessions: [], sources: [health] }
  }
}

function sessionOf(
  process: SessionOwner & { cwd: string },
  conversation: Conversation | null,
  key: string,
  placement: ReturnType<typeof placementOf>
): SessionRef {
  const session = conversation?.session
  // A process that has not written a session yet is still an agent at its desk.
  const id = session?.id ?? placeholderId(process)
  return {
    key,
    provider: 'opencode',
    ...(session?.selectedModel && { selectedModel: session.selectedModel }),
    sessionId: id,
    pid: process.pid,
    name: session?.title || folderName(process.cwd),
    cwd: process.cwd,
    ...placement,
    host: process.pid === null ? 'unknown' : 'terminal',
    orcaPaneKey: null,
    ...(conversation?.state ?? OPENCODE_IDLE),
    subagents: conversation?.subagents ?? [],
    startedAtMs: process.startedAtMs,
    updatedAtMs: session?.updatedAtMs ?? process.startedAtMs,
    // Running totals for the session, as Codex reports its own. Children keep their own rows.
    usage: session
      ? {
          own: session.counts,
          subagents: zeroCounts(),
          spawned: 0,
          contextTokens: null,
          contextLimit: null
        }
      : null,
    ...(session?.createdAtMs != null && { threadStartedAtMs: session.createdAtMs }),
    // OpenCode's accounts are never read, so its tokens are filed under no account.
    accountKey: null
  }
}
