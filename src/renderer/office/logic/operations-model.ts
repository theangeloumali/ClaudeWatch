import { parseAgentKey } from '../../../shared/office/agent-key'
import {
  buildFloorActivitySummaries,
  type FloorActivitySummary
} from '../../../shared/office/floor-aggregates'
import { observeAgent, type AgentEvidence } from '../../../shared/office/observation'
import type { AgentView, ProviderId } from '../../../shared/office/types'
import type { FloorGeometry, OfficeFrame, RoomGeometry } from '../scene-model'
import { physicalFloorId } from '../scene/all-floor-model'
import { agentActivityDetail } from './activity-summary'

export interface OperationsWorker {
  key: string
  label: string
  sessionKey: string
  projectLabel: string
  provider: ProviderId
  roomId: string | null
  isSubagent: boolean
  isPresent: boolean
  detail: string
  evidence: AgentEvidence
}

interface OperationsWorkArea {
  room: RoomGeometry
  workers: OperationsWorker[]
  freshWorkingCount: number
  attentionCount: number
}

export interface OperationsOffice {
  floor: FloorGeometry
  summary: FloorActivitySummary
  projectLabels: string[]
  workers: OperationsWorker[]
  workAreas: OperationsWorkArea[]
}

interface OperationsInput {
  frame: OfficeFrame
  nowMs: number
}

// dry-new: existing floor summaries establish truth; this joins them to physical work-area navigation.
export function buildOperationsModel({ frame, nowMs }: OperationsInput): OperationsOffice[] {
  const summaries = buildFloorActivitySummaries({ ...frame, nowMs })
  const views = new Map(frame.agents.map((agent) => [agent.agentKey, agent]))
  return frame.floors.flatMap((floor) => {
    const summary = summaries.find((candidate) => candidate.floorId === floor.floorId)
    if (!summary) return []
    const workers = summary.assignedAgentKeys.flatMap((key) => {
      const worker = workerFor({ frame, nowMs, floor, key, view: views.get(key) })
      return worker ? [worker] : []
    })
    return [
      {
        floor,
        summary,
        projectLabels: [...new Set(workers.map((worker) => worker.projectLabel))],
        workers,
        workAreas: floor.rooms.map((room) => {
          const occupants = workers.filter((worker) => worker.roomId === room.id)
          return {
            room,
            workers: occupants,
            freshWorkingCount: occupants.filter((worker) =>
              summary.workingAgentKeys.includes(worker.key)
            ).length,
            attentionCount: occupants.filter((worker) =>
              summary.attentionAgentKeys.includes(worker.key)
            ).length
          }
        })
      }
    ]
  })
}

function workerFor({
  frame,
  nowMs,
  floor,
  key,
  view
}: OperationsInput & {
  floor: FloorGeometry
  key: string
  view: AgentView | undefined
}): OperationsWorker | null {
  const identity = parseAgentKey(key, frame.sessions)
  if (!identity) return null
  const evidence = observeAgent({ ...frame, nowMs, agentKey: key })
  const room = view
    ? floor.rooms.find((candidate) => candidate.id === view.roomId)
    : floor.rooms.find((candidate) => candidate.sessionKey === identity.session.key)
  return {
    key,
    label: identity.member?.name ?? identity.member?.type ?? identity.session.name,
    sessionKey: identity.session.key,
    projectLabel: identity.session.projectLabel,
    provider: identity.session.provider,
    roomId: room?.id ?? null,
    isSubagent: identity.member !== undefined,
    isPresent: Boolean(view && physicalFloorId(view) === floor.floorId),
    detail: evidenceDetail(evidence),
    evidence
  }
}

function evidenceDetail(evidence: AgentEvidence): string {
  if (evidence.status === 'disconnected') return 'Disconnected · last known assignment'
  if (evidence.status === 'stale') return 'Stale observation · activity unconfirmed'
  if (evidence.status === 'unknown') return 'Activity unavailable · no own observation'
  return agentActivityDetail(
    {
      activity: evidence.activity ?? 'idle',
      attention: evidence.attention ?? 'none'
    },
    evidence.currentTool?.name
  )
}
