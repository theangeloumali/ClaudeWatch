import { OBSERVATION_STALE_AFTER_MS } from '../shared/office/observation'
import type {
  AgentActivity,
  AgentAttention,
  CurrentTool,
  SessionRef,
  SessionUsage,
  SourceHealth,
  TokenCounts
} from '../shared/office/types'
import { type CodexTotal, codexTotalOf } from '../shared/accounts'
import { programName } from '../shared/platform-process'
import {
  claimFolders,
  folderKey,
  isAppFolder,
  unplacedConversations,
  type WrittenConversation
} from './process-folders'
import { type BridgeIo, folderName, isLabel, isMissing, jsonObject, object } from './io'
import { placementOf, resolveProject } from './project-root'
import { type CodexKind, findRollouts, recentDayFolders, type Rollout } from './codex-rollouts'
import {
  applyCodexSubagentTotals,
  attachCodexSubagents,
  currentCodexActivity
} from './codex-subagents'
import { parseCodexUsage } from './codex-usage'
import { isStillWorking, OPEN_TOOL_HOLD_MS, quietFor } from './liveness'
import { toolActivity, toolCategory } from './tool-category'
import {
  forgetExited,
  keyOf,
  newestFirst,
  placeholderId,
  type ProcessRow,
  readProcessTable,
  rememberedFolder,
  type SessionOwner
} from './process-table'

// A Codex app-server: the host of desktop, IDE and plugin threads.
function isAppServer({ argv }: ProcessRow): boolean {
  return programName(argv[0]) === 'codex' && argv.includes('app-server', 1)
}

const sessionCommandOf = (argv: string[]): number =>
  argv.findIndex((arg) => /^(exec|e|resume|fork)$/.test(arg))

export function codexProcesses(
  rows: ProcessRow[]
): { pid: number; startedAtMs: number; kind: CodexKind }[] {
  return rows
    .filter(({ argv }) => {
      if (programName(argv[0]) !== 'codex') return false
      const sessionCommand = sessionCommandOf(argv)
      // An exec prompt may mention a helper; only command arguments precede it.
      const commandArgs = argv.slice(1, sessionCommand < 0 ? undefined : sessionCommand)
      return !commandArgs.some((arg) =>
        /^(app-server|exec-server|mcp-server|sandbox|helper)(?:$|-)/.test(arg)
      )
    })
    .map(({ pid, startedAtMs, argv }) => {
      const command = argv[sessionCommandOf(argv)]
      return { pid, startedAtMs, kind: command === 'exec' || command === 'e' ? 'exec' : 'terminal' }
    })
}

const CALLS = new Set(['function_call', 'custom_tool_call', 'local_shell_call'])
const OUTPUTS = new Set([
  'function_call_output',
  'custom_tool_call_output',
  'local_shell_call_output'
])
const THINKING = new Set(['reasoning', 'agent_reasoning', 'agent_message', 'task_started'])
const DEFAULT_CALL_NAME: Record<string, string> = { local_shell_call: 'exec_command' }

export function parseCodexActivity(tail: string): {
  activity: AgentActivity
  attention: AgentAttention
  updatedAtMs: number
  currentTool: CurrentTool | null
} {
  let activity: AgentActivity = 'idle'
  let attention: AgentAttention = 'none'
  let updatedAtMs = 0
  const openCalls = new Map<string, CurrentTool>()
  for (const line of tail.split('\n')) {
    const record = jsonObject(line)
    if (record?.type !== 'event_msg' && record?.type !== 'response_item') continue
    const payload = object(record.payload)
    const type = typeof payload?.type === 'string' ? payload.type : ''
    const callId = payload?.call_id ?? payload?.id
    const callKey = typeof callId === 'string' ? callId : 'unknown'
    if (CALLS.has(type)) {
      // A shell call carries no name of its own.
      const name = isLabel(payload?.name) ? payload.name : (DEFAULT_CALL_NAME[type] ?? 'unknown')
      openCalls.set(callKey, { name, category: toolCategory(name) })
    } else if (OUTPUTS.has(type)) {
      // Outputs close their own call, not another tool still running in parallel.
      openCalls.delete(callKey)
      activity = 'thinking'
    } else if (THINKING.has(type) || (type === 'message' && payload?.role === 'assistant'))
      activity = 'thinking'
    else if (type === 'task_complete' || type === 'turn_aborted') {
      openCalls.clear()
      activity = 'idle'
    } else continue
    attention = type === 'task_complete' ? 'done' : 'none'
    const timestamp = typeof record.timestamp === 'string' ? Date.parse(record.timestamp) : 0
    updatedAtMs = Number.isFinite(timestamp) ? timestamp : 0
  }
  const currentTool = [...openCalls.values()].at(-1) ?? null
  const needsAnswer = currentTool?.name === 'request_user_input' || currentTool?.name === 'question'
  return {
    activity: needsAnswer ? 'idle' : currentTool ? toolActivity(currentTool.category) : activity,
    attention: needsAnswer ? 'question' : attention,
    updatedAtMs,
    currentTool
  }
}

interface Remembered {
  // The last full walk of the session folders, and its rollouts kept fresh since.
  walk: Walk | null
  // A live process had no rollout at the last look: its first one is looked for on every tick.
  isWaiting: boolean
  // The usage last read from each live rollout, by session id. A long tool output pushes the
  // newest `token_count` out of the 64 KB tail, and its total still stands until the next one.
  usage: Map<string, SessionUsage>
  childTotals: Map<string, Map<string, TokenCounts>>
  // Where each live process runs, by pid and start time: asking costs an `lsof` run.
  folders: Map<string, string>
  // The placeholder key a process without a rollout was first shown under, by pid and start time.
  placeholders: Map<string, string>
  // What each live rollout's tail held, by path, with the size and time of the file it was read from.
  tails: Map<
    string,
    {
      mtimeMs: number
      size: number
      observedAtMs: number
      state: ReturnType<typeof parseCodexActivity>
      usage: SessionUsage | null
      // The session last shown for this rollout: what its final total is filed under.
      session: SessionRef | null
    }
  >
}
const remembered = new WeakMap<BridgeIo, Remembered>()
// Hosted own-work freshness; live descendants may still retain an idle parent container.
const HOSTED_FRESH_MS = 120_000
// Codex never deletes a rollout, so a full walk grows with history: between full walks only
// the ones written lately are looked at again. A new thread waits at most this long.
const FULL_WALK_MS = 30_000

interface Walk {
  atMs: number
  processes: string
  derived: boolean
  rollouts: Rollout[]
}

async function currentRollouts(
  root: string,
  io: BridgeIo,
  memory: Remembered,
  processes: { pid: number; startedAtMs: number }[],
  derivesAccounts: boolean,
  now: number,
  platform: NodeJS.Platform
): Promise<Rollout[]> {
  const key = processes.map(({ pid, startedAtMs }) => `${pid}:${startedAtMs}`).join(',')
  const last = memory.walk
  const isDue =
    !last ||
    last.processes !== key ||
    last.derived !== derivesAccounts ||
    now < last.atMs ||
    now - last.atMs >= FULL_WALK_MS
  if (isDue) {
    const rollouts = await findRollouts(root, io, derivesAccounts, platform)
    memory.walk = { atMs: now, processes: key, derived: derivesAccounts, rollouts }
    return rollouts
  }
  const refreshed = await Promise.all(
    last.rollouts.map(async (rollout): Promise<Rollout | null> => {
      // Shown last tick, or still within an open tool's hold: its next write must be seen.
      if (now - rollout.mtimeMs >= OPEN_TOOL_HOLD_MS && !memory.tails.has(rollout.path))
        return rollout
      try {
        const { mtimeMs, size } = await io.stat(rollout.path)
        return { ...rollout, mtimeMs, size }
      } catch (error) {
        if (isMissing(error)) return null
        throw error
      }
    })
  )
  const current = new Map(
    refreshed.flatMap((rollout) => (rollout ? [[rollout.path, rollout] as const] : []))
  )
  // A process waiting for its first thread finds it among the last two days' rollouts alone.
  if (memory.isWaiting) {
    const days = recentDayFolders(now)
    for (const rollout of await findRollouts(root, io, derivesAccounts, platform, days))
      current.set(rollout.path, rollout)
  }
  last.rollouts = [...current.values()].sort(
    (a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path)
  )
  return last.rollouts
}

export interface CodexBatch {
  sessions: SessionRef[]
  // The total each rollout ended on, for the sessions that left since the last look: one may
  // have finished a turn after the last look that found its process.
  departed: CodexTotal[]
  sources: SourceHealth[]
}

export async function collectCodex(
  root: string,
  io: BridgeIo,
  readProcesses = (): Promise<ProcessRow[]> => readProcessTable(io, platform),
  derivesAccounts = false,
  now = Date.now(),
  platform: NodeJS.Platform = process.platform
): Promise<CodexBatch> {
  const sessions: SessionRef[] = []
  const departed: CodexTotal[] = []
  const health: SourceHealth = { id: 'codex', ok: true, detail: 'empty' }
  let memory = remembered.get(io)
  if (!memory) {
    remembered.set(
      io,
      (memory = {
        walk: null,
        isWaiting: false,
        usage: new Map(),
        childTotals: new Map(),
        folders: new Map(),
        placeholders: new Map(),
        tails: new Map()
      })
    )
  }
  const { usage: known, folders, placeholders, tails } = memory
  const live = new Set<string>()
  const liveTails = new Set<string>()
  try {
    const rows = await readProcesses()
    const processes = codexProcesses(rows)
    const isHosting = rows.some(isAppServer)
    const rollouts =
      processes.length || isHosting
        ? await currentRollouts(root, io, memory, processes, derivesAccounts, now, platform)
        : []
    const used = new Set<string>()
    const observe = async (rollout: Rollout) => {
      let tail = tails.get(rollout.path)
      if (!tail || tail.mtimeMs !== rollout.mtimeMs || tail.size !== rollout.size) {
        const text = await io.readTail(rollout.path)
        tail = {
          mtimeMs: rollout.mtimeMs,
          size: rollout.size,
          observedAtMs: now,
          state: parseCodexActivity(text),
          usage: parseCodexUsage(text),
          session: null
        }
        tails.set(rollout.path, tail)
      }
      liveTails.add(rollout.path)
      live.add(rollout.id)
      if (tail.usage) known.set(rollout.id, tail.usage)
      return tail
    }
    // One session per rollout: its activity and usage from the tail, its place from `cwd`.
    const show = async (
      rollout: Rollout | undefined,
      cwd: string,
      owner: SessionOwner
    ): Promise<SessionRef> => {
      const id = rollout?.id ?? placeholderId(owner)
      // Unchanged tails keep the time of the actual read, not this poll's time.
      const tail = rollout ? await observe(rollout) : undefined
      const state = tail
        ? tail.state
        : { ...parseCodexActivity(''), updatedAtMs: owner.startedAtMs }
      // Cached assistant output must age out even when no new bytes arrive.
      const activity = currentCodexActivity(state, now)
      const usage = tail?.usage ?? known.get(id) ?? null
      if (usage) known.set(id, usage)
      live.add(id)
      const project = await resolveProject(cwd, io, now, platform)
      const session: SessionRef = {
        key: keyOf(placeholders, owner, 'codex', rollout?.id),
        provider: 'codex',
        sessionId: id,
        pid: owner.pid,
        name: folderName(cwd),
        cwd,
        ...placementOf(project),
        host: 'terminal',
        orcaPaneKey: null,
        ...state,
        activity,
        subagents: [],
        startedAtMs: owner.startedAtMs,
        usage,
        ...(tail && {
          observation: {
            sourceId: 'codex',
            observedAtMs: tail.observedAtMs,
            staleAfterMs: OBSERVATION_STALE_AFTER_MS,
            coverage: 'own' as const
          }
        }),
        ...(rollout?.startedAtMs != null && { threadStartedAtMs: rollout.startedAtMs }),
        accountKey: rollout?.accountKey ?? null,
        // A rollout names its own account, so nothing is inferred from who is signed in.
        ...(rollout?.accountKey && { accountConfidence: 'exact' as const })
      }
      sessions.push(session)
      if (tail) tail.session = session
      health.detail = 'live'
      return session
    }
    const threads: (WrittenConversation & { rollout: Rollout })[] =
      platform === 'win32'
        ? rollouts.flatMap((rollout) =>
            rollout.startedBy === null ||
            rollout.isSubagent ||
            rollout.parentThreadId ||
            isAppFolder(rollout.cwd, platform)
              ? []
              : [
                  {
                    rollout,
                    folder: rollout.cwd,
                    createdAtMs: rollout.startedAtMs,
                    writtenAtMs: rollout.mtimeMs,
                    kind: rollout.startedBy
                  }
                ]
          )
        : []
    claimFolders(processes, folders, threads)
    let isWaiting = false
    for (const process of newestFirst(processes)) {
      try {
        // On Windows the folder is the one claimed above, from the process's rollouts.
        const cwd = await rememberedFolder(io, folders, process, platform)
        if (cwd && isAppFolder(cwd, platform)) continue
        const rollout = cwd
          ? rollouts.find(
              (candidate) =>
                !candidate.isSubagent &&
                !candidate.parentThreadId &&
                folderKey(candidate.cwd, platform) === folderKey(cwd, platform) &&
                !used.has(candidate.id)
            )
          : undefined
        // On macOS `lsof` has placed it already: the 30 s walk finds its first rollout soon enough.
        if (!rollout) isWaiting ||= platform === 'win32'
        if (!cwd) continue
        if (rollout) used.add(rollout.id)
        await show(rollout, cwd, process)
      } catch {
        health.ok = false
        health.detail = 'process read failed'
      }
    }
    // A thread no process can yet be told apart for is shown as an app-server's is, without one.
    const unclaimed = threads.filter(({ rollout }) => !used.has(rollout.id))
    for (const { rollout } of unplacedConversations(processes, folders, unclaimed)) {
      used.add(rollout.id)
      try {
        await show(rollout, rollout.cwd, {
          pid: null,
          startedAtMs:
            rollout.startedAtMs ?? tails.get(rollout.path)?.session?.startedAtMs ?? rollout.mtimeMs
        })
      } catch {
        health.ok = false
        health.detail = 'rollout read failed'
      }
    }
    const showHosted = async ({
      rollout,
      hasLiveDescendant = false
    }: {
      rollout: Rollout
      hasLiveDescendant?: boolean
    }): Promise<SessionRef | undefined> => {
      if (
        rollout.isSubagent ||
        rollout.parentThreadId ||
        used.has(rollout.id) ||
        isAppFolder(rollout.cwd, platform)
      )
        return undefined
      const quietMs = quietFor(now, rollout.mtimeMs)
      if (quietMs === null) return undefined
      const shown = tails.get(rollout.path)
      const isOwnLive =
        quietMs < OPEN_TOOL_HOLD_MS &&
        isStillWorking(quietMs, HOSTED_FRESH_MS, shown?.state.currentTool != null)
      if (!isOwnLive && !hasLiveDescendant) return undefined
      used.add(rollout.id)
      try {
        const session = await show(rollout, rollout.cwd, {
          pid: null,
          // An undated rollout keeps the time it was first shown with, not each new write's.
          startedAtMs: rollout.startedAtMs ?? shown?.session?.startedAtMs ?? rollout.mtimeMs
        })
        // A descendant keeps the container, not expired tools or synthetic parent activity.
        if (
          hasLiveDescendant &&
          (quietMs >= OPEN_TOOL_HOLD_MS ||
            !isStillWorking(quietMs, HOSTED_FRESH_MS, session.currentTool !== null))
        ) {
          session.activity = 'idle'
          session.currentTool = null
        }
        return session
      } catch {
        health.ok = false
        health.detail = 'rollout read failed'
        return undefined
      }
    }
    memory.isWaiting = isWaiting
    // Resolve live explicit descendants before a quiet hosted root can be filtered out.
    try {
      await attachCodexSubagents({
        sessions,
        rollouts,
        totals: memory.childTotals,
        observe: async (rollout) => {
          const tail = await observe(rollout)
          return {
            ...tail.state,
            usage: tail.usage ?? known.get(rollout.id) ?? null,
            observedAtMs: tail.observedAtMs
          }
        },
        now,
        platform,
        ...(isHosting && { showParent: showHosted })
      })
    } catch {
      health.ok = false
      health.detail = 'child rollout read failed'
    }
    // Threads with their own liveness evidence need no child to keep them present.
    for (const rollout of isHosting ? rollouts : []) {
      if (now - rollout.mtimeMs >= OPEN_TOOL_HOLD_MS) break
      await showHosted({ rollout })
    }
    // Totals are finalized only after every retained parent has been shown.
    applyCodexSubagentTotals(sessions, memory.childTotals)
    for (const id of known.keys()) if (!live.has(id)) known.delete(id)
    forgetExited(processes, folders, placeholders)
    for (const [path, { session }] of tails) {
      if (liveTails.has(path)) continue
      tails.delete(path)
      try {
        // Its last turn may have been written after the last look that found its process.
        const usage = session && parseCodexUsage(await io.readTail(path))
        const total =
          usage &&
          codexTotalOf({
            ...session,
            usage: {
              ...usage,
              subagents: session?.usage?.subagents ?? usage.subagents,
              spawned: session?.usage?.spawned ?? usage.spawned
            }
          })
        if (total) departed.push(total)
      } catch (error) {
        if (isMissing(error)) continue
        health.ok = false
        health.detail = 'rollout read failed'
      }
    }
  } catch {
    health.ok = false
    health.detail = 'discovery failed'
  }
  if (health.ok) {
    health.checkedAtMs = now
    health.staleAfterMs = OBSERVATION_STALE_AFTER_MS
  }
  return { sessions, departed, sources: [health] }
}
