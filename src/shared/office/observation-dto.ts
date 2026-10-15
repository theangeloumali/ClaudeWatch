import { isJsonObject } from '../json-object'
import { isAgentObservation } from './observation'
import { isTerminalProvenance } from './observation-terminal'

// dry-new: the legacy feed guard checks envelopes, not optional evidence payloads.
const ATTENTION_VALUES = ['none', 'permission', 'question', 'done', 'error', 'limited'] as const
const TOOL_CATEGORIES = ['read', 'edit', 'run', 'web', 'agent', 'other'] as const
const isTimestamp = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
const isDuration = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

function validMember(value: unknown): boolean {
  if (!isJsonObject(value)) return false
  const { observation, attention, currentTool } = value
  return (
    (observation === undefined || isAgentObservation(observation)) &&
    (attention === undefined || ATTENTION_VALUES.some((known) => known === attention)) &&
    (currentTool === undefined ||
      currentTool === null ||
      (isJsonObject(currentTool) &&
        typeof currentTool.name === 'string' &&
        TOOL_CATEGORIES.some((known) => known === currentTool.category)))
  )
}

function validSession(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    (value.observation === undefined || isAgentObservation(value.observation)) &&
    Array.isArray(value.subagents) &&
    value.subagents.every(validMember)
  )
}

function validSource(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    (value.checkedAtMs === undefined || isTimestamp(value.checkedAtMs)) &&
    (value.staleAfterMs === undefined || isDuration(value.staleAfterMs))
  )
}

export function hasValidObservationMetadata(message: unknown): boolean {
  if (!isJsonObject(message)) return false
  if (message.type === 'resync') return true
  const state = message.type === 'hello' ? message.snapshot : message
  if (!isJsonObject(state)) return false
  const sessions = message.type === 'hello' ? state.sessions : state.upserts
  return (
    Array.isArray(sessions) &&
    sessions.every(validSession) &&
    (state.sources === undefined ||
      (Array.isArray(state.sources) && state.sources.every(validSource)))
  )
}

export function hasValidPeekMetadata(reply: unknown): boolean {
  if (!isJsonObject(reply)) return false
  const { capturedAtMs, targetAgentKey, terminal } = reply
  if (capturedAtMs !== undefined && !isTimestamp(capturedAtMs)) return false
  if (targetAgentKey !== undefined && (typeof targetAgentKey !== 'string' || !targetAgentKey))
    return false
  if (terminal === undefined) return true
  return (
    isTerminalProvenance(terminal) &&
    (targetAgentKey === undefined || terminal.ownerAgentKey === targetAgentKey)
  )
}
