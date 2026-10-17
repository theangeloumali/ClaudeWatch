import type { AgentView } from '../../../shared/office/types'
import { parseAgentKey } from '../../../shared/office/agent-key'
import type { OfficeFrame } from '../scene-model'
import { physicalFloorId } from '../scene/all-floor-model'
import { agentCountLabel, sessionForAgent } from './floor-model'
import { DESK_REACH } from './room-layout'
import {
  ACTIVITY_UNAVAILABLE_LABEL,
  activitySummaryText,
  agentActivityDetail,
  isActivityAvailable,
  isAgentActivityAvailable,
  LEAVING_LABEL,
  PLAYING_GAMES_LABEL,
  summariseActivity
} from './activity-summary'

export type CardStatus =
  | 'working'
  | 'waiting'
  | 'permission'
  | 'done'
  | 'error'
  | 'limited'
  | 'idle'

export interface NameCard {
  agentKey: string
  // Set for main agents, so the card can offer Review for that session.
  sessionKey: string | null
  kind: 'card' | 'pill'
  x: number
  z: number
  title: string
  detail: string
  status: CardStatus
  // Culling groups cards by project and breaks priority ties toward the latest update.
  projectKey: string | null
  updatedAtMs: number
  isAvailable?: boolean
}

export interface ProjectStack {
  projectKey: string
  zoneId: string | null
  x: number
  z: number
  text: string
}

// One DOM node per card; screen-space culling (card-culling.ts) decides which are shown.
export const MAX_NAME_CARDS = 40

function statusFor(agent: AgentView): CardStatus {
  switch (agent.attention) {
    case 'permission':
      return 'permission'
    case 'question':
      return 'waiting'
    case 'none':
      return agent.activity === 'idle' ? 'idle' : 'working'
    default:
      return agent.attention
  }
}

// Resting in the game corner; an agent that needs you or has failed shows that instead.
const isGaming = (agent: AgentView): boolean =>
  agent.place === 'lounge' &&
  agent.activity === 'idle' &&
  (agent.attention === 'none' || agent.attention === 'done')

function priority(card: NameCard, selectedAgentKey: string | null): number {
  if (card.agentKey === selectedAgentKey) return 0
  if (card.status === 'permission' || card.status === 'waiting') return 1
  if (card.status === 'error' || card.status === 'limited') return 2
  return card.kind === 'card' ? 3 : 4
}

export function buildNameCards(
  frame: OfficeFrame,
  floorId: string | null,
  selectedAgentKey: string | null
): NameCard[] {
  const seen = new Set<string>()
  const cards = frame.agents
    .filter((agent) => {
      if (floorId !== null && physicalFloorId(agent) !== floorId) return false
      if (seen.has(agent.agentKey)) return false
      seen.add(agent.agentKey)
      return true
    })
    .map((agent): NameCard => {
      // A room can be reassigned while its former worker is still walking out.
      const identity = parseAgentKey(agent.agentKey, frame.sessions)
      const session =
        identity && agent.isSubagent === (identity.member !== undefined)
          ? identity.session
          : undefined
      const isLeaving = agent.place === 'leaving'
      const isAvailable =
        !isLeaving && session !== undefined && isAgentActivityAvailable(frame, agent)
      const detail = (toolName?: string): string => {
        if (isLeaving) return LEAVING_LABEL
        if (!isAvailable) return ACTIVITY_UNAVAILABLE_LABEL
        return isGaming(agent) ? PLAYING_GAMES_LABEL : agentActivityDetail(agent, toolName)
      }
      const meta = {
        projectKey: session?.projectKey ?? null,
        updatedAtMs: session?.updatedAtMs ?? 0,
        isAvailable
      }
      if (agent.isSubagent) {
        return {
          agentKey: agent.agentKey,
          kind: 'pill',
          sessionKey: null,
          x: agent.x,
          z: agent.z,
          title: agent.label,
          detail: detail(),
          status: isAvailable ? statusFor(agent) : 'idle',
          ...meta
        }
      }
      // A card floats over the desk in front of its agent; in the lounge there is no desk.
      const reach = agent.place === 'lounge' || agent.physicalFloorId === null ? 0 : DESK_REACH
      return {
        agentKey: agent.agentKey,
        kind: 'card',
        sessionKey: session?.key ?? null,
        x: agent.x + Math.sin(agent.heading) * reach,
        z: agent.z + Math.cos(agent.heading) * reach,
        title: session?.name ?? agent.label,
        detail: detail(session?.currentTool?.name),
        status: isAvailable ? statusFor(agent) : 'idle',
        ...meta
      }
    })
  return cards
    .sort(
      (first, second) =>
        priority(first, selectedAgentKey) - priority(second, selectedAgentKey) ||
        second.updatedAtMs - first.updatedAtMs
    )
    .slice(0, MAX_NAME_CARDS)
}

// One summary per project for the stacked badge shown when its cards crowd together.
export function buildProjectStacks(frame: OfficeFrame, floorId: string | null): ProjectStack[] {
  const floors = frame.floors.filter((floor) => floorId === null || floor.floorId === floorId)
  // Group once, so each project does not rescan every agent.
  const membersByProject = new Map<string, AgentView[]>()
  const seenAgents = new Set<string>()
  for (const agent of frame.agents) {
    if (floorId !== null && physicalFloorId(agent) !== floorId) continue
    if (seenAgents.has(agent.agentKey)) continue
    seenAgents.add(agent.agentKey)
    const projectKey = sessionForAgent(frame, agent)?.projectKey
    if (!projectKey) continue
    const members = membersByProject.get(projectKey)
    if (members) members.push(agent)
    else membersByProject.set(projectKey, [agent])
  }
  const seenProjects = new Set<string>()
  return floors
    .flatMap((floor) => floor.zones)
    .flatMap((company) => company.children.filter((child) => child.kind === 'project'))
    .flatMap((zone) => {
      const members = zone.projectKey ? membersByProject.get(zone.projectKey) : undefined
      if (!zone.projectKey || !members || seenProjects.has(zone.projectKey)) return []
      seenProjects.add(zone.projectKey)
      const parts = [
        zone.label,
        agentCountLabel(members.length),
        activitySummaryText(
          summariseActivity(
            members,
            isActivityAvailable(
              frame,
              members.map((member) => member.provider)
            )
          )
        )
      ]
      return [
        {
          projectKey: zone.projectKey,
          zoneId: zone.id,
          x: zone.x,
          z: zone.z,
          text: parts.join(' · ')
        }
      ]
    })
}
