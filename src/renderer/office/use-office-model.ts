import { useEffect, useMemo, useRef, useState } from 'react'
import { parseAgentKey } from '../../shared/office/agent-key'
import { buildTokenLedger } from '../deck/tokens'
import { structuralKey } from '../office-live/pose-store'
import { buildAgentFacts, type AgentFacts } from './hud/agent-facts'
import { buildAttentionQueue } from './logic/attention-queue'
import { bayForAgent, summariseFloors } from './logic/floor-model'
import { useOfficeSettings } from './logic/office-settings'
import { createRoleBook, maskFrame } from './logic/role-names'
import { reachTarget } from './logic/interactions'
import { buildNameCards, buildProjectStacks } from './logic/name-cards'
import { workstationSeat } from './logic/workstation-framing'
import { resolveTheme, type ThemeAssignments } from './logic/office-themes'
import {
  buildCompanyList,
  buildOfficeActivity,
  buildOfficesTree,
  nextActivityChangeAtMs
} from './logic/zone-model'
import type { OfficeFrame } from './scene-model'
import { getTheme, themeCharacter } from './themes/registry'

const isSameApartFromAgents = (a: OfficeFrame, b: OfficeFrame): boolean =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].every(
    (field) => field === 'agents' || Object.is(Reflect.get(a, field), Reflect.get(b, field))
  )

// The frame as of its last structural change: a frame that only moved agents keeps it (perf-2).
function useStructuralFrame(frame: OfficeFrame | null): OfficeFrame | null {
  const kept = useRef<{ frame: OfficeFrame; agentsKey: string } | null>(null)
  if (!frame) return null
  const agentsKey = structuralKey(frame.agents)
  const previous = kept.current
  if (previous?.agentsKey === agentsKey && isSameApartFromAgents(previous.frame, frame))
    return previous.frame
  kept.current = { frame, agentsKey }
  return frame
}

// The frame the HUD and scene draw. With names hidden, roles replace every name here, before
// any DOM node or sign texture; the saved city is built from the feed, upstream of this.
export function useVisibleFrame(frame: OfficeFrame | null): OfficeFrame | null {
  const { hideNames } = useOfficeSettings()
  const [roles] = useState(createRoleBook)
  return useMemo(
    () => (frame && hideNames ? maskFrame(frame, roles) : frame),
    [frame, hideNames, roles]
  )
}

// The render clock, plus one re-render when evidence next turns fresh or stale, so activity
// goes stale with no new frame and an idle office is never woken for nothing (perf-2).
function useActivityClock(frame: OfficeFrame | null): number {
  const [, setWakes] = useState(0)
  const nowMs = Date.now()
  const wakeAtMs = frame ? nextActivityChangeAtMs(frame, nowMs) : null
  useEffect(() => {
    if (wakeAtMs === null) return
    const timer = setTimeout(() => setWakes((count) => count + 1), wakeAtMs - Date.now())
    return () => clearTimeout(timer)
  }, [wakeAtMs])
  return nowMs
}

// What the HUD and the scene show, derived from the latest frame. Lists that do not depend on
// where agents stand follow the frame's structure, so a walking step rebuilds none of them.
export function useOfficeLists(
  frame: OfficeFrame | null,
  floorId: string | null,
  selectedAgentKey: string | null
) {
  const sessions = frame?.sessions
  const structural = useStructuralFrame(frame)
  // Newly received evidence is judged against the render clock, never an older tick (trap).
  const nowMs = useActivityClock(structural)
  const queue = useMemo(() => buildAttentionQueue(sessions ?? []), [sessions])
  // The Tower stays as a landmark showing the building's totals; it no longer picks floors.
  const towerFloors = useMemo(() => (structural ? summariseFloors(structural) : []), [structural])
  const companies = useMemo(() => (structural ? buildOfficesTree(structural) : []), [structural])
  const activity = useMemo(() => buildOfficeActivity(structural, nowMs), [structural, nowMs])
  const ledger = useMemo(() => buildTokenLedger(sessions ?? []), [sessions])
  const agentFacts = useMemo(
    () => (structural ? buildAgentFacts(structural) : new Map<string, AgentFacts>()),
    [structural]
  )
  const floorAgents = useMemo(
    () => (frame ? frame.agents.filter((agent) => agent.floorId === floorId) : []),
    [frame, floorId]
  )
  const cards = useMemo(
    () => (frame ? buildNameCards(frame, null, selectedAgentKey) : []),
    [frame, selectedAgentKey]
  )
  const stacks = useMemo(
    () => (structural ? buildProjectStacks(structural, null) : []),
    [structural]
  )
  const companyList = useMemo(() => (structural ? buildCompanyList(structural) : []), [structural])
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
