import { observeAgent } from '../../shared/office/observation'
import { parseAgentKey } from '../../shared/office/agent-key'
import type { SessionRef, SourceHealth } from '../../shared/office/types'
import { goToLounge, setFinished, type AgentRecord } from './behaviour'
import type { FloorLayout, LayoutMap, LoungeLayout, Slot } from './layout'
import { loungeSeats } from './lounge'
import type { FloorRoutes } from './world-floor-routes'

// dry-new: source eligibility is independent of movement ticks.
interface LeisureContext {
  agents: Map<string, AgentRecord>
  sessions: readonly SessionRef[]
  sources: readonly SourceHealth[]
  connected: boolean
  nowMs: number
  hasTrips: boolean
  map: LayoutMap
  routes: FloorRoutes
  lounges: ReadonlyMap<string, LoungeLayout>
  clearPassage: (key: string) => void
  // Walks it to its desk, or fades it there when no indoor route reaches it.
  callHome: (agent: AgentRecord, floor: FloorLayout, desk: Slot) => AgentRecord
}

interface Leisure extends LeisureContext {
  // Any stamped record means the feed observes, so an unstamped agent's activity is unknown and
  // it stays at its desk (owner rule; the cards' hasOwnRecords).
  hasRecords: boolean
}

function leisureMode(agent: AgentRecord, context: Leisure): 'legacy' | 'advanced' | 'none' {
  if (!context.connected || agent.state === 'leaving') return 'none'
  const resolved = parseAgentKey(agent.view.agentKey, context.sessions)
  if (!resolved) return 'none'
  if (!resolved.session.observation && !resolved.member?.observation)
    return !context.hasRecords && context.sources.every((source) => source.ok) ? 'legacy' : 'none'
  const evidence = observeAgent({
    agentKey: agent.view.agentKey,
    sessions: context.sessions,
    sources: context.sources,
    connected: context.connected,
    nowMs: context.nowMs
  })
  const source = context.sources.find(
    (candidate) => candidate.id === evidence.observation?.sourceId
  )
  const hasHealthySource =
    source?.ok === true &&
    (source.checkedAtMs === undefined ||
      source.staleAfterMs === undefined ||
      context.nowMs - source.checkedAtMs < source.staleAfterMs)
  return evidence.status === 'fresh' &&
    hasHealthySource &&
    (evidence.attention === 'none' || evidence.attention === 'done') &&
    (evidence.activity === 'idle' || evidence.attention === 'done')
    ? 'advanced'
    : 'none'
}

function returnHome(agent: AgentRecord, context: Leisure): void {
  const key = agent.view.agentKey
  const floor = context.map.floors.find((candidate) => candidate.id === agent.view.floorId)
  const desk = floor?.rooms
    .find((room) => room.id === agent.view.roomId)
    ?.slots.find((slot) => slot.id === agent.view.slotId)
  if (!floor || !desk || agent.state === 'leaving') return
  context.clearPassage(key)
  // Disabling trips does not restart legacy work; advanced visits retain their cooldown.
  const returning = context.callHome(agent, floor, desk)
  context.agents.set(
    key,
    leisureMode(agent, context) === 'legacy' ? returning : setFinished(returning, false)
  )
}

// Sends idle agents to a lounge seat on their own floor, and calls them home when work,
// unknown activity or the switch says so.
export function reconcileLeisure(leisureContext: LeisureContext): void {
  const { agents } = leisureContext
  if (
    !leisureContext.hasTrips &&
    ![...agents.values()].some((agent) => agent.view.place === 'lounge')
  )
    return
  const context: Leisure = {
    ...leisureContext,
    hasRecords: leisureContext.sessions.some(
      (session) =>
        session.observation !== undefined ||
        session.subagents.some((member) => member.observation !== undefined)
    )
  }
  const modes = new Map(
    [...context.agents].map(([key, agent]) => [key, leisureMode(agent, context)])
  )
  for (const [key, current] of context.agents) {
    const mode = modes.get(key)
    const agent = mode === 'legacy' ? current : setFinished(current, mode === 'advanced')
    context.agents.set(key, agent)
    if (agent.view.place === 'lounge' && (!context.hasTrips || mode === 'none'))
      returnHome(agent, context)
  }
  const loungeAgents = [...context.agents.values()].map((agent) =>
    modes.get(agent.view.agentKey) === 'none' ? { ...agent, finishedForMs: null } : agent
  )
  for (const [key, seat] of loungeSeats(
    loungeAgents,
    context.hasTrips ? context.lounges : new Map()
  )) {
    const agent = context.agents.get(key)
    if (!agent) continue
    const floor = context.map.floors.find((candidate) => candidate.id === agent.view.floorId)
    if (!floor) continue
    if (!seat) {
      if (agent.view.place === 'lounge') returnHome(agent, context)
      continue
    }
    const target = agent.path.at(-1) ?? agent.view
    if (agent.view.place === 'lounge' && target.x === seat.x && target.z === seat.z) continue
    const route = context.routes.toFloor(agent.view, floor, seat)
    // A sitter the floor left with no way to its moved seat goes home rather than stay stuck.
    if (!route.length) {
      if (agent.view.place === 'lounge') returnHome(agent, context)
      continue
    }
    context.clearPassage(key)
    context.agents.set(key, goToLounge(agent, seat, route))
  }
}
