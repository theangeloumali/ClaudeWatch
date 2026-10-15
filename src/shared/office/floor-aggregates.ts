import { agentKey, parseAgentKey } from './agent-key'
import { observeAgent } from './observation'
import type { AgentView, SessionRef, SourceHealth } from './types'

// dry-new: floor totals must join live record identities, not decorative or departing bodies.
export interface FloorActivitySummary {
  floorId: string
  buildingId?: string
  label: string
  assignedAgentKeys: string[]
  presentAgentKeys: string[]
  workingAgentKeys: string[]
  attentionAgentKeys: string[]
  unknownAgentKeys: string[]
  staleAgentKeys: string[]
}

type SummaryFloor = {
  floorId: string
  label: string
  rooms: readonly { sessionKey: string | null }[]
  buildingId?: string
}
type LocatedAgent = AgentView & { physicalFloorId?: string | null }

interface FloorSummaryInput {
  floors: readonly SummaryFloor[]
  agents: readonly LocatedAgent[]
  sessions: readonly SessionRef[]
  sources: readonly SourceHealth[]
  connected: boolean
  nowMs: number
}

const BLOCKING_ATTENTION = new Set(['permission', 'question', 'error'])
const WORKING_ACTIVITIES = new Set([
  'thinking',
  'reading',
  'editing',
  'running',
  'searching',
  'delegating'
])

export function buildFloorActivitySummaries(options: FloorSummaryInput): FloorActivitySummary[] {
  const floors = [...options.floors].sort((left, right) =>
    left.floorId < right.floorId ? -1 : left.floorId > right.floorId ? 1 : 0
  )
  const summaries = new Map(
    floors.map((floor): [string, FloorActivitySummary] => [
      floor.floorId,
      {
        floorId: floor.floorId,
        label: floor.label,
        ...(floor.buildingId !== undefined && { buildingId: floor.buildingId }),
        assignedAgentKeys: [],
        presentAgentKeys: [],
        workingAgentKeys: [],
        attentionAgentKeys: [],
        unknownAgentKeys: [],
        staleAgentKeys: []
      }
    ])
  )
  const assignment = new Map<string, string>()
  for (const floor of floors) {
    for (const room of floor.rooms) {
      if (room.sessionKey && !assignment.has(room.sessionKey))
        assignment.set(room.sessionKey, floor.floorId)
    }
  }
  const views = new Map<string, LocatedAgent>()
  for (const view of [...options.agents].sort((left, right) =>
    left.floorId < right.floorId ? -1 : left.floorId > right.floorId ? 1 : 0
  )) {
    if (views.has(view.agentKey) || !parseAgentKey(view.agentKey, options.sessions)) continue
    views.set(view.agentKey, view)
  }
  const keys = options.sessions.flatMap((session) => [
    session.key,
    ...session.subagents.map((member) => agentKey(session.key, member.id))
  ])
  for (const key of [...new Set(keys)].sort()) {
    const resolved = parseAgentKey(key, options.sessions)
    if (!resolved) continue
    const view = views.get(key)
    const assignedFloor = resolved.member
      ? (view?.floorId ?? assignment.get(resolved.session.key))
      : (assignment.get(resolved.session.key) ?? view?.floorId)
    const assigned = summaries.get(assignedFloor ?? '')
    const presentFloor = view?.physicalFloorId === undefined ? view?.floorId : view.physicalFloorId
    if (presentFloor) summaries.get(presentFloor)?.presentAgentKeys.push(key)
    if (!assigned) continue
    assigned.assignedAgentKeys.push(key)
    const evidence = observeAgent({ ...options, agentKey: key })
    if (evidence.status === 'stale') assigned.staleAgentKeys.push(key)
    else if (evidence.status !== 'fresh' || evidence.attention === undefined)
      assigned.unknownAgentKeys.push(key)
    else if (BLOCKING_ATTENTION.has(evidence.attention)) assigned.attentionAgentKeys.push(key)
    else if (evidence.activity && WORKING_ACTIVITIES.has(evidence.activity))
      assigned.workingAgentKeys.push(key)
  }
  return [...summaries.values()]
}
