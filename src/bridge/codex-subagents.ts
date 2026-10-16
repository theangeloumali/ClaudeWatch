import { OBSERVATION_STALE_AFTER_MS } from '../shared/office/observation'
import { type CodexTotal, codexTotalOf } from '../shared/accounts'
import type { SessionRef, SessionUsage, TokenCounts } from '../shared/office/types'
import type { Rollout } from './codex-rollouts'
import { isInsideAppBundle } from './process-table'
import { isAppFolder } from './process-folders'
import { isStillWorking, OPEN_TOOL_HOLD_MS, quietFor, SUBAGENT_FRESH_MS } from './liveness'
import { NEXT_STEP_MS } from './opencode-activity'

// dry-new: explicit rollout lineage has no process owner and must never become a CLI root.
export type CodexChildObservation = Pick<
  SessionRef,
  'activity' | 'attention' | 'currentTool' | 'updatedAtMs'
> & { usage: SessionUsage | null; observedAtMs: number }

export function currentCodexActivity(
  state: Pick<SessionRef, 'activity' | 'updatedAtMs'>,
  now: number
): SessionRef['activity'] {
  return state.activity === 'thinking' &&
    state.updatedAtMs > 0 &&
    now - state.updatedAtMs >= NEXT_STEP_MS
    ? 'idle'
    : state.activity
}

// What a child thread has spent, and when it began, as its parent's ledger needs them.
export interface CodexChildTotal {
  counts: TokenCounts
  threadStartedAtMs: number | null
}

const MAX_CHILD_ROLLOUTS = 128
const MAX_ANCESTORS = 8

export async function attachCodexSubagents(options: {
  sessions: SessionRef[]
  rollouts: Rollout[]
  totals: Map<string, Map<string, CodexChildTotal>>
  observe: (rollout: Rollout) => Promise<CodexChildObservation>
  now: number
  platform?: NodeJS.Platform
  showParent?: (options: {
    rollout: Rollout
    hasLiveDescendant: boolean
  }) => Promise<SessionRef | undefined>
}): Promise<void> {
  const { sessions, rollouts, totals, observe, now, showParent } = options
  const parents = new Map(sessions.map((session) => [session.sessionId, session]))
  const records = new Map<string, Rollout>()
  for (const rollout of rollouts) {
    if (!records.has(rollout.id)) records.set(rollout.id, rollout)
  }
  const parentIds = new Set(parents.keys())
  if (showParent) {
    for (const rollout of records.values()) {
      if (
        !rollout.isSubagent &&
        !rollout.parentThreadId &&
        !isAppFolder(rollout.cwd, options.platform ?? process.platform)
      )
        parentIds.add(rollout.id)
    }
  }
  const visited = new Set<string>()
  let inspected = 0
  for (const rollout of rollouts) {
    if (!rollout.isSubagent || !rollout.parentThreadId || visited.has(rollout.id)) continue
    visited.add(rollout.id)
    const quietMs = quietFor(now, rollout.mtimeMs)
    if (quietMs === null || quietMs >= OPEN_TOOL_HOLD_MS || isInsideAppBundle(rollout.cwd)) continue
    if (inspected++ >= MAX_CHILD_ROLLOUTS) break
    let parentId: string | null | undefined = rollout.parentThreadId
    const ancestors = new Set([rollout.id])
    for (let depth = 0; parentId && !parentIds.has(parentId) && depth < MAX_ANCESTORS; depth++) {
      if (ancestors.has(parentId)) {
        parentId = null
        break
      }
      ancestors.add(parentId)
      parentId = records.get(parentId)?.parentThreadId
    }
    let parent = parentId ? parents.get(parentId) : undefined
    const parentRollout = parentId ? records.get(parentId) : undefined
    if (!parent && (!showParent || !parentId || !parentIds.has(parentId) || !parentRollout))
      continue
    const observation = await observe(rollout)
    const activity = currentCodexActivity(observation, now)
    const needsAnswer =
      observation.attention === 'question' || observation.attention === 'permission'
    const isLive =
      (activity !== 'idle' || needsAnswer) &&
      isStillWorking(quietMs, SUBAGENT_FRESH_MS, observation.currentTool !== null || needsAnswer)
    if (!parent && parentRollout && showParent) {
      parent = await showParent({ rollout: parentRollout, hasLiveDescendant: isLive })
      if (parent) parents.set(parent.sessionId, parent)
    }
    if (!parent) continue
    let counted = totals.get(parent.sessionId)
    if (!counted) totals.set(parent.sessionId, (counted = new Map()))
    if (observation.usage)
      counted.set(rollout.id, {
        counts: observation.usage.own,
        threadStartedAtMs: rollout.startedAtMs
      })
    if (!isLive) continue
    parent.subagents.push({
      id: rollout.id,
      type: rollout.agentRole ?? 'subagent',
      ...(rollout.agentName && { name: rollout.agentName }),
      kind: 'subagent',
      pid: null,
      orcaPaneKey: null,
      activity,
      attention: observation.attention,
      currentTool: observation.currentTool,
      tokens: observation.usage?.own ?? null,
      observation: {
        sourceId: 'codex',
        observedAtMs: observation.observedAtMs,
        staleAfterMs: OBSERVATION_STALE_AFTER_MS,
        coverage: 'own'
      }
    })
  }
}

export function applyCodexSubagentTotals(
  sessions: SessionRef[],
  totals: Map<string, Map<string, CodexChildTotal>>
): void {
  for (const session of sessions) {
    const counted = totals.get(session.sessionId)
    if (!counted || !session.usage) continue
    const subagents: TokenCounts = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }
    for (const { counts } of counted.values()) {
      subagents.input += counts.input
      subagents.output += counts.output
      subagents.cacheWrite += counts.cacheWrite
      subagents.cacheRead += counts.cacheRead
    }
    session.usage = { ...session.usage, subagents, spawned: counted.size }
  }
  const liveParents = new Set(sessions.map((session) => session.sessionId))
  for (const parentId of totals.keys()) if (!liveParents.has(parentId)) totals.delete(parentId)
}

// Each child thread's own running total, filed under its parent's account and project. The ledger
// counts a total's growth, so a child out of view after a restart never lowers its parent's (health-15).
export function codexChildTotals(
  sessions: SessionRef[],
  totals: ReadonlyMap<string, ReadonlyMap<string, CodexChildTotal>>
): CodexTotal[] {
  return sessions.flatMap((parent) => {
    const filed = codexTotalOf(parent)
    if (!filed) return []
    return [...(totals.get(parent.sessionId) ?? [])].map(([childId, child]) => ({
      ...filed,
      sessionKey: `codex:${childId}`,
      threadStartedAtMs: child.threadStartedAtMs,
      counts: child.counts
    }))
  })
}
