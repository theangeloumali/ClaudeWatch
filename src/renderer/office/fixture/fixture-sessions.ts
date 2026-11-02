import { projectKey } from '../../../shared/office/project-key'
import type {
  SelectedModelRef,
  SessionRef,
  SessionUsage,
  SubagentRef,
  TokenCounts
} from '../../../shared/office/types'
import {
  ACTIVITY_SCRIPT,
  TOOL_FOR_ACTIVITY,
  SUBAGENT_TYPES,
  type FixtureSession,
  type FixtureProject
} from './fixture-projects'

const SECOND_MS = 1000
const FIXTURE_TICK_MS = 2000
// How far back to look for the start of the current attention or activity run.
const RUN_LOOKBACK_TICKS = 60
const MILLION = 1_000_000
const TOKENS_PER_TICK = 180_000
const CODEX_CONTEXT_LIMIT = 272_000
// The share of a lead's tokens its subagents and teammates spent.
const CREW_SHARE = 0.35

function pick<T>(script: readonly T[], tick: number, session: FixtureSession): T {
  const step = Math.floor((tick + session.offset) / session.period)
  return script[((step % script.length) + script.length) % script.length]
}

// First tick of the unbroken run of the current value, so a waiting session's "since" never resets.
function runStartTick<T>(script: readonly T[], tick: number, session: FixtureSession): number {
  const current = pick(script, tick, session)
  let start = tick
  while (start > tick - RUN_LOOKBACK_TICKS && pick(script, start - 1, session) === current)
    start -= 1
  return start
}

// Cache reads dominate a long session, as they do in real transcripts.
function splitTokens(total: number): TokenCounts {
  const input = Math.round(total * 0.004)
  const output = Math.round(total * 0.011)
  const cacheWrite = Math.round(total * 0.045)
  return { input, output, cacheWrite, cacheRead: total - input - output - cacheWrite }
}

// Real Claude ids, so the Brain card and Runs-on chips show the names a live run would.
const CLAUDE_MODEL_IDS = [
  'claude-opus-4-1-20250805',
  'claude-sonnet-4-5-20250929',
  'claude-haiku-4-5-20251001'
] as const

function claudeModelFor(session: FixtureSession, index: number): SelectedModelRef | undefined {
  if (session.provider !== 'claude') return undefined
  return { providerId: 'anthropic', modelId: CLAUDE_MODEL_IDS[index % CLAUDE_MODEL_IDS.length] }
}

export function companyKeyFor(project: FixtureProject): string {
  return projectKey(project.root.slice(0, project.root.lastIndexOf('/')))
}

function subagentsFor(
  session: FixtureSession,
  context: { tick: number; nowMs: number },
  sessionKey: string
): SubagentRef[] {
  const { tick, nowMs } = context
  const teammates = (session.teammates ?? []).map(
    (teammate, index): SubagentRef => ({
      id: `team-${index}`,
      type: teammate.type,
      name: teammate.name,
      kind: 'teammate',
      activity: ACTIVITY_SCRIPT[(tick + index * 2 + 1) % ACTIVITY_SCRIPT.length],
      pid: 51_000 + index,
      startedAtMs: nowMs - (index + 2) * 4 * 60 * SECOND_MS,
      orcaPaneKey: `preview-pane-${index}`,
      tokens: splitTokens((38 + index * 17) * MILLION + tick * TOKENS_PER_TICK)
    })
  )
  const count = session.subagentScript ? pick(session.subagentScript, tick, session) : 0
  const subagents = Array.from(
    { length: count },
    (_, index): SubagentRef => ({
      id: `${sessionKey}-sub-${index}`,
      type: SUBAGENT_TYPES[index % SUBAGENT_TYPES.length],
      activity: ACTIVITY_SCRIPT[(tick + index * 3) % ACTIVITY_SCRIPT.length],
      tokens: splitTokens((3 + index * 2) * MILLION)
    })
  )
  return [...teammates, ...subagents]
}

function usageFor(session: FixtureSession, index: number, tick: number): SessionUsage | null {
  if (session.isUncounted) return null
  const total =
    (60 + ((index * 173 + session.offset * 59) % 400)) * MILLION + tick * TOKENS_PER_TICK
  const hasCrew = Boolean(session.subagentScript || session.teammates)
  const crewTotal = hasCrew ? Math.round(total * CREW_SHARE) : 0
  const isCodex = session.provider === 'codex'
  return {
    own: splitTokens(total - crewTotal),
    subagents: splitTokens(crewTotal),
    spawned: hasCrew ? 8 + ((index * 5 + session.offset) % 25) : 0,
    // OpenCode's database gives a running total and no window.
    contextTokens:
      session.provider === 'opencode'
        ? null
        : isCodex
          ? 90_000 + ((index * 41_000) % 160_000)
          : 225_000 + ((index * 97_000 + session.offset * 53_000) % 545_000),
    contextLimit: isCodex ? CODEX_CONTEXT_LIMIT : null
  }
}

export function sessionFor(
  project: FixtureProject,
  session: FixtureSession,
  index: number,
  context: { tick: number; nowMs: number }
): SessionRef {
  const key = `${session.provider}:${project.label.toLowerCase()}-${index}`
  const attention = session.attentionScript
    ? pick(session.attentionScript, context.tick, session)
    : 'none'
  const activity = attention === 'none' ? pick(ACTIVITY_SCRIPT, context.tick, session) : 'idle'
  const changedAtTick = session.attentionScript
    ? runStartTick(session.attentionScript, context.tick, session)
    : runStartTick(ACTIVITY_SCRIPT, context.tick, session)
  return {
    key,
    provider: session.provider,
    selectedModel: claudeModelFor(session, index),
    sessionId: key.split(':')[1],
    pid: 40_000 + index,
    name: session.name,
    cwd: project.root,
    projectKey: projectKey(project.root),
    projectLabel: project.label,
    projectRoot: project.root,
    companyKey: companyKeyFor(project),
    companyLabel: project.root.split('/').at(-2)!,
    worktree: null,
    host: session.host ?? 'terminal',
    orcaPaneKey: session.host === 'orca' ? `preview-pane-${session.name}` : null,
    activity,
    attention,
    currentTool: TOOL_FOR_ACTIVITY[activity],
    subagents: subagentsFor(session, context, key),
    startedAtMs: context.nowMs - (index + 1) * 7 * 60 * SECOND_MS - session.offset * 41 * SECOND_MS,
    updatedAtMs: context.nowMs - (context.tick - changedAtTick) * FIXTURE_TICK_MS,
    usage: usageFor(session, index, context.tick)
  }
}
