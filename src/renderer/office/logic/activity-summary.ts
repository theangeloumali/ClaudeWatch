import { type AgentEvidence, observeAgent } from '../../../shared/office/observation'
import type { AgentActivity, AgentView, ProviderId } from '../../../shared/office/types'
import { stateOfAttention } from '../../deck/roster'
import type { OfficeFrame } from '../scene-model'
import { GEM_SPECS } from './status-gem'

export interface ActivitySummary {
  working: number
  needsYou: number
  idleDone: number
  issues: number
  isAvailable: boolean
}

export const ACTIVITY_SUMMARY_LABELS = {
  working: GEM_SPECS.working.label,
  needsYou: 'Needs you',
  idleDone: 'Idle/Done',
  issues: 'Issues'
} as const
export const ACTIVITY_UNAVAILABLE_LABEL = 'Activity unavailable'
// A worker on its way out, as the sim reports it (seating-5).
export const LEAVING_LABEL = 'Leaving'
// An idle agent seated in its office's game corner.
export const PLAYING_GAMES_LABEL = 'Playing games'

export function isActivityAvailable(
  frame: Pick<OfficeFrame, 'connected' | 'sources'>,
  providers: readonly ProviderId[] = ['claude', 'codex', 'opencode']
): boolean {
  return (
    frame.connected &&
    !frame.sources.some(
      (source) =>
        !source.ok &&
        providers.some((provider) => source.id === provider || source.id.startsWith(`${provider}:`))
    )
  )
}

// An observing bridge stamps every session it reads; fixtures and older feeds carry none.
function hasOwnRecords(frame: Pick<OfficeFrame, 'sessions'>): boolean {
  return frame.sessions.some(
    (session) =>
      session.observation !== undefined ||
      session.subagents.some((member) => member.observation !== undefined)
  )
}

// A live feed or any stamped record means activity comes from evidence, not presence.
export function hasObservedFeed(
  frame: Pick<OfficeFrame, 'sessions' | 'feedReceivedAtMs'>
): boolean {
  return frame.feedReceivedAtMs !== undefined || hasOwnRecords(frame)
}

// Where records exist, an agent's activity is shown only from its own fresh one (MISSED-1).
export function isAgentActivityAvailable(
  frame: OfficeFrame,
  agent: Pick<AgentView, 'agentKey' | 'provider'>,
  nowMs = Date.now(),
  // Already read by the caller, so an agent is observed once.
  observed?: AgentEvidence
): boolean {
  if (!hasObservedFeed(frame)) return isActivityAvailable(frame, [agent.provider])
  const evidence = observed ?? observeAgent({ ...frame, agentKey: agent.agentKey, nowMs })
  return (
    evidence.status === 'fresh' &&
    evidence.activity !== undefined &&
    evidence.attention !== undefined
  )
}

// One vocabulary for reported activity, never inferred task goals.
const ACTIVITY_LABEL: Record<AgentActivity, string> = {
  idle: 'Idle',
  thinking: 'Thinking',
  reading: 'Reading',
  editing: 'Editing',
  running: 'Running',
  searching: 'Searching',
  delegating: 'Delegating'
}

// dry-new: Squad tallies omit issue states and availability; Office needs one mutually exclusive count.
export function summariseActivity(
  agents: readonly Pick<AgentView, 'activity' | 'attention'>[],
  isAvailable: boolean
): ActivitySummary {
  const summary = { working: 0, needsYou: 0, idleDone: 0, issues: 0, isAvailable }
  if (!isAvailable) return summary
  for (const agent of agents) {
    const { state } = stateOfAttention(agent.attention, agent.activity)
    if (state === 'working') summary.working += 1
    else if (state === 'needs-you') summary.needsYou += 1
    else if (state === 'error' || state === 'limited') summary.issues += 1
    else summary.idleDone += 1
  }
  return summary
}

export function combineActivity(
  summaries: readonly ActivitySummary[],
  isAvailable: boolean
): ActivitySummary {
  const total = summariseActivity(
    [],
    isAvailable && summaries.every((summary) => summary.isAvailable)
  )
  if (!total.isAvailable) return total
  for (const summary of summaries) {
    total.working += summary.working
    total.needsYou += summary.needsYou
    total.idleDone += summary.idleDone
    total.issues += summary.issues
  }
  return total
}

export function activitySummaryText(summary: ActivitySummary): string {
  if (!summary.isAvailable) return ACTIVITY_UNAVAILABLE_LABEL
  const parts = [
    `${summary.working} ${ACTIVITY_SUMMARY_LABELS.working}`,
    `${summary.needsYou} ${ACTIVITY_SUMMARY_LABELS.needsYou}`,
    `${summary.idleDone} ${ACTIVITY_SUMMARY_LABELS.idleDone}`
  ]
  if (summary.issues > 0) parts.push(`${summary.issues} ${ACTIVITY_SUMMARY_LABELS.issues}`)
  return parts.join(' · ')
}

export function agentActivityDetail(
  agent: Pick<AgentView, 'activity' | 'attention'>,
  toolName?: string
): string {
  if (agent.attention !== 'none') return GEM_SPECS[agent.attention].label
  const activity = ACTIVITY_LABEL[agent.activity]
  return toolName ? `${activity} · ${toolName}` : activity
}
