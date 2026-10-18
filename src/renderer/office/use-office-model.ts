import { useMemo } from 'react'
import { parseAgentKey } from '../../shared/office/agent-key'
import { buildTokenLedger } from '../deck/tokens'
import { buildAgentFacts, type AgentFacts } from './hud/agent-facts'
import { buildAttentionQueue } from './logic/attention-queue'
import { bayForAgent, summariseFloors } from './logic/floor-model'
import { reachTarget } from './logic/interactions'
import { buildNameCards, buildProjectStacks } from './logic/name-cards'
import { workstationSeat } from './logic/workstation-framing'
import { resolveTheme, type ThemeAssignments } from './logic/office-themes'
import { buildCompanyList, buildOfficeActivity, buildOfficesTree } from './logic/zone-model'
import type { OfficeFrame } from './scene-model'
import { getTheme, themeCharacter } from './themes/registry'

// What the HUD and the scene show, derived from the latest frame. The feed keeps `sessions`
// between its messages while a frame arrives for every step, so the lists follow the sessions.
export function useOfficeLists(
  frame: OfficeFrame | null,
  floorId: string | null,
  selectedAgentKey: string | null
) {
  const sessions = frame?.sessions
  const queue = useMemo(() => buildAttentionQueue(sessions ?? []), [sessions])
  // The Tower stays as a landmark showing the building's totals; it no longer picks floors.
  const towerFloors = useMemo(() => (frame ? summariseFloors(frame) : []), [frame])
  const companies = useMemo(() => (frame ? buildOfficesTree(frame) : []), [frame])
  const activity = useMemo(() => buildOfficeActivity(frame), [frame])
  const ledger = useMemo(() => buildTokenLedger(sessions ?? []), [sessions])
  const agentFacts = useMemo(
    () => (frame ? buildAgentFacts(frame) : new Map<string, AgentFacts>()),
    [frame]
  )
  const floorAgents = useMemo(
    () => (frame ? frame.agents.filter((agent) => agent.floorId === floorId) : []),
    [frame, floorId]
  )
  const cards = useMemo(
    () => (frame ? buildNameCards(frame, null, selectedAgentKey) : []),
    [frame, selectedAgentKey]
  )
  const stacks = useMemo(() => (frame ? buildProjectStacks(frame, null) : []), [frame])
  const companyList = useMemo(() => (frame ? buildCompanyList(frame) : []), [frame])
  return {
    sessions,
    queue,
    towerFloors,
    companies,
    activity,
    ledger,
    agentFacts,
    floorAgents,
    cards,
    stacks,
    companyList
  }
}

// The selected agent with its session, its teammate record, where it can be reached and the
// character it plays in its office's theme.
export function selectionOf(
  frame: OfficeFrame | null,
  selectedAgentKey: string | null,
  themeAssignments: ThemeAssignments,
  floorThemeId: string
) {
  const agent = frame?.agents.find((candidate) => candidate.agentKey === selectedAgentKey)
  const identity = frame && agent ? parseAgentKey(agent.agentKey, frame.sessions) : null
  const hasCurrentIdentity = Boolean(
    agent && identity && agent.isSubagent === (identity.member !== undefined)
  )
  const session = hasCurrentIdentity ? identity?.session : undefined
  const member = hasCurrentIdentity ? identity?.member : undefined
  const target = session ? reachTarget(session, member) : undefined
  const character =
    frame && agent && session
      ? themeCharacter(
          resolveTheme(session, themeAssignments, floorThemeId),
          agent,
          bayForAgent(frame, agent)
        )
      : null
  const themeId = session ? resolveTheme(session, themeAssignments, floorThemeId) : floorThemeId
  const workstation = getTheme(themeId).workstation
  const floor = frame?.floors.find((candidate) => candidate.floorId === agent?.floorId)
  const canWorkstation = Boolean(
    session && agent && floor && workstation && workstationSeat(agent, floor)
  )
  return { agent, session, member, target, character, workstation, canWorkstation }
}
