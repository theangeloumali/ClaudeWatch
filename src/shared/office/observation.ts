import { isJsonObject } from '../json-object'
import { parseAgentKey } from './agent-key'
import type {
  AgentActivity,
  AgentAttention,
  AgentObservation,
  CurrentTool,
  SessionRef,
  SourceHealth
} from './types'

// dry-new: activity timestamps describe changes, not whether an own record was read.
export const OBSERVATION_STALE_AFTER_MS = 60_000
type ObservationStatus = 'fresh' | 'stale' | 'unknown' | 'disconnected'

export interface AgentEvidence {
  status: ObservationStatus
  observation?: AgentObservation
  activity?: AgentActivity
  attention?: AgentAttention
  currentTool: CurrentTool | null
}

interface ObservationContext {
  sources: readonly SourceHealth[]
  connected: boolean
  nowMs: number
}

export function isAgentObservation(value: unknown): value is AgentObservation {
  return (
    isJsonObject(value) &&
    typeof value.sourceId === 'string' &&
    value.sourceId.length > 0 &&
    typeof value.observedAtMs === 'number' &&
    Number.isFinite(value.observedAtMs) &&
    value.observedAtMs >= 0 &&
    typeof value.staleAfterMs === 'number' &&
    Number.isFinite(value.staleAfterMs) &&
    value.staleAfterMs > 0 &&
    (value.coverage === 'own' || value.coverage === 'unknown')
  )
}

function statusOf(
  observation: AgentObservation | undefined,
  context: ObservationContext
): ObservationStatus {
  if (!context.connected) return 'disconnected'
  if (
    !isAgentObservation(observation) ||
    observation.coverage !== 'own' ||
    !Number.isFinite(context.nowMs) ||
    observation.observedAtMs > context.nowMs
  )
    return 'unknown'
  const source = context.sources.find((candidate) => candidate.id === observation.sourceId)
  if (source?.ok === false) return 'unknown'
  return context.nowMs - observation.observedAtMs >= observation.staleAfterMs ? 'stale' : 'fresh'
}

export function observeSession(
  options: ObservationContext & { session: SessionRef }
): AgentEvidence {
  const { session } = options
  return {
    status: statusOf(session.observation, options),
    observation: session.observation,
    activity: session.activity,
    attention: session.attention,
    currentTool: session.currentTool
  }
}

export function observeAgent(
  options: ObservationContext & {
    agentKey: string
    sessions: readonly SessionRef[]
  }
): AgentEvidence {
  const resolved = parseAgentKey(options.agentKey, options.sessions)
  if (!resolved)
    return { status: options.connected ? 'unknown' : 'disconnected', currentTool: null }
  if (!resolved.member) return observeSession({ ...options, session: resolved.session })
  const member = resolved.member
  return {
    status: statusOf(member.observation, options),
    observation: member.observation,
    activity: member.activity,
    attention: member.attention,
    currentTool: member.currentTool ?? null
  }
}
