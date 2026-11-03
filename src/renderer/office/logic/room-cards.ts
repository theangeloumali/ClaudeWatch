import type { AgentView, ProviderId } from '../../../shared/office/types'
import type { OfficeFrame } from '../scene-model'
import { isAgentActivityAvailable } from './activity-summary'
import { membersByProject, projectZones, statusFor } from './name-cards'

const MAX_ROOM_FACES = 3

interface RoomFace {
  agentKey: string
  provider: ProviderId
  initials: string
}

export interface RoomCard {
  projectKey: string
  zoneId: string
  x: number
  z: number
  label: string
  agentCount: number
  runningCount: number
  faces: RoomFace[]
  moreCount: number
}

function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('')
}

// The Campus room summary. `castName` is the roster name, or null while names are hidden.
export function buildRoomCards(
  frame: OfficeFrame,
  castName: (agent: AgentView) => string | null
): RoomCard[] {
  const groups = membersByProject(frame, null)
  return projectZones(frame, null).map((zone) => {
    const members = groups.get(zone.projectKey ?? '') ?? []
    const faces = members.slice(0, MAX_ROOM_FACES).map((agent) => ({
      agentKey: agent.agentKey,
      provider: agent.provider,
      initials: initialsOf(castName(agent) ?? agent.label)
    }))
    return {
      projectKey: zone.projectKey ?? '',
      zoneId: zone.id,
      x: zone.x,
      z: zone.z,
      label: zone.label,
      agentCount: members.length,
      // A status read from no fresh evidence would claim work nobody observed.
      runningCount: members.filter(
        (agent) => statusFor(agent) === 'working' && isAgentActivityAvailable(frame, agent)
      ).length,
      faces,
      moreCount: members.length - faces.length
    }
  })
}
