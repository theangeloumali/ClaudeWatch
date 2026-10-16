import type { WorkstationSpec } from '../themes/types'
import { workstationPlacement } from '../themes/workstations'
import type { FloorGeometry, OfficeFrame } from '../scene-model'
import { STATE_COLOR } from '../office-palette'
import {
  agentActivityDetail,
  ACTIVITY_UNAVAILABLE_LABEL,
  hasOwnRecords,
  isActivityAvailable
} from './activity-summary'
import { sessionForAgent } from './floor-model'
import { gemFor } from './status-gem'
import { observeAgent } from '../../../shared/office/observation'

export interface WorkstationDisplay extends ReturnType<typeof workstationPlacement> {
  agentKey: string
  title: string
  detail: string
  color: string
}

// dry-new: name cards follow moving workers; physical screens must stay on their reserved desks.
export function buildWorkstationDisplays({
  frame,
  floor,
  workstationForRoom
}: {
  frame: OfficeFrame
  floor: FloorGeometry
  workstationForRoom: (roomId: string) => WorkstationSpec | undefined
}): WorkstationDisplay[] {
  const rooms = new Map(floor.rooms.map((room) => [room.id, room]))
  return frame.agents.flatMap((agent) => {
    // Away from the desk, or walking out while it may already be someone else's.
    if (agent.floorId !== floor.floorId || agent.place === 'lounge' || agent.isLeaving) return []
    const slot = rooms.get(agent.roomId)?.seats.find((seat) => seat.slotId === agent.slotId)
    const spec = workstationForRoom(agent.roomId)
    if (!slot || !spec) return []
    const session = sessionForAgent(frame, agent)
    const hasObservation = frame.feedReceivedAtMs !== undefined || hasOwnRecords(frame)
    const evidence = observeAgent({ ...frame, agentKey: agent.agentKey, nowMs: Date.now() })
    const isAvailable =
      !!session &&
      (hasObservation
        ? evidence.status === 'fresh' &&
          evidence.activity !== undefined &&
          evidence.attention !== undefined
        : isActivityAvailable(frame, [agent.provider]))
    const reportedAgent =
      hasObservation && evidence.activity && evidence.attention
        ? {
            ...agent,
            activity: evidence.activity,
            attention: evidence.attention
          }
        : agent
    const tool = hasObservation
      ? evidence.currentTool?.name
      : !agent.isSubagent && agent.attention === 'none'
        ? session?.currentTool?.name
        : undefined
    return [
      {
        ...workstationPlacement(slot, spec),
        agentKey: agent.agentKey,
        title: isAvailable ? agentActivityDetail(reportedAgent) : ACTIVITY_UNAVAILABLE_LABEL,
        detail: isAvailable ? tool || 'Reported activity' : 'No live report',
        color: isAvailable
          ? (gemFor(reportedAgent)?.color ?? STATE_COLOR.done)
          : STATE_COLOR.limited
      }
    ]
  })
}
