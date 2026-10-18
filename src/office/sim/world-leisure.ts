import { observeAgent } from '../../shared/office/observation'
import { parseAgentKey } from '../../shared/office/agent-key'
import type { SessionRef, SourceHealth } from '../../shared/office/types'
import { goToLounge, returnToDesk, setFinished, type AgentRecord } from './behaviour'
import type { LayoutMap, LoungeLayout } from './layout'
import { loungeSeats } from './lounge'
import type { FloorRoutes } from './world-floor-routes'
import type { VenueBookings, WorldVenue } from './world-venues'

// dry-new: source eligibility and shared leisure bookings are independent of movement ticks.
interface LeisureContext {
  agents: Map<string, AgentRecord>
  sessions: readonly SessionRef[]
  sources: readonly SourceHealth[]
  connected: boolean
  nowMs: number
  hasTrips: boolean
  venues: readonly WorldVenue[]
  bookings: VenueBookings
  map: LayoutMap
  routes: FloorRoutes
  lounges: ReadonlyMap<string, LoungeLayout>
  clearPassage: (key: string) => void
}

function leisureMode(agent: AgentRecord, context: LeisureContext): 'legacy' | 'advanced' | 'none' {
  if (!context.connected || agent.state === 'leaving') return 'none'
  const resolved = parseAgentKey(agent.view.agentKey, context.sessions)
  if (!resolved) return 'none'
  if (!resolved.session.observation && !resolved.member?.observation)
    return context.sources.every((source) => source.ok) ? 'legacy' : 'none'
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

function returnHome(agent: AgentRecord, context: LeisureContext): void {
  const key = agent.view.agentKey
  const floor = context.map.floors.find((candidate) => candidate.id === agent.view.floorId)
  const desk = floor?.rooms
    .find((room) => room.id === agent.view.roomId)
    ?.slots.find((slot) => slot.id === agent.view.slotId)
  if (!floor || !desk || agent.state === 'leaving') return
  const route = context.routes.toFloor(agent.view, floor, desk)
  if (!route.length) return
  context.bookings.release(key)
  context.clearPassage(key)
  // Disabling trips does not restart legacy work; advanced visits retain their cooldown.
  const returning = returnToDesk(agent, desk.heading, route)
  context.agents.set(
    key,
    leisureMode(agent, context) === 'legacy' ? returning : setFinished(returning, false)
  )
}

export function reconcileLeisure(context: LeisureContext): void {
  if (
    !context.hasTrips &&
    ![...context.agents.values()].some((agent) => agent.view.place === 'lounge')
  )
    return
  const venues = context.hasTrips ? context.venues : []
  const modes = new Map(
    [...context.agents].map(([key, agent]) => [key, leisureMode(agent, context)])
  )
  for (const [key, current] of context.agents) {
    const mode = modes.get(key)
    const agent = mode === 'legacy' ? current : setFinished(current, mode === 'advanced')
    context.agents.set(key, agent)
    if (agent.view.place === 'lounge' && (!context.hasTrips || mode === 'none'))
      returnHome(agent, context)
    else if (agent.view.place === 'lounge' && mode === 'advanced' && !agent.path.length) {
      if (agent.leisureArrivedAtMs === undefined) {
        agent.leisureArrivedAtMs = context.nowMs
        if (agent.destinationVenueId) agent.view.venueId = agent.destinationVenueId
      } else if (context.nowMs - agent.leisureArrivedAtMs >= 16_000) returnHome(agent, context)
    }
  }
  const loungeAgents = [...context.agents.values()]
    .filter(
      (agent) =>
        !agent.destinationVenueId &&
        !agent.view.venueId &&
        !(venues.length && modes.get(agent.view.agentKey) === 'advanced')
    )
    .map((agent) =>
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
    if (!route.length) continue
    context.clearPassage(key)
    context.agents.set(key, goToLounge(agent, seat, route))
  }
  const assignments = context.bookings.reconcile({
    agents: [...context.agents.values()],
    venues,
    canVisit: (agent) =>
      context.hasTrips && modes.get(agent.view.agentKey) === 'advanced' && agent.state !== 'leaving'
  })
  for (const [key, assignment] of assignments) {
    const agent = context.agents.get(key)
    if (!agent) continue
    if (!assignment) {
      returnHome(agent, context)
      continue
    }
    const { venue, seat } = assignment
    const target = agent.path.at(-1) ?? agent.view
    if (agent.destinationVenueId === venue.id && target.x === seat.x && target.z === seat.z)
      continue
    const floor =
      context.routes.floor(agent.view.physicalFloorId) ?? context.routes.floor(agent.view.floorId)
    if (!floor) continue
    const route = context.routes.toGround(agent.view, floor)
    if (!route.length) {
      context.bookings.release(key)
      continue
    }
    const street = context.routes.street(route.at(-1) ?? agent.view, venue.entrance)
    if (!street.length) {
      context.bookings.release(key)
      continue
    }
    route.push(...street, { ...seat, elevation: 0, physicalFloorId: null })
    const visitor = goToLounge(agent, seat, route)
    visitor.destinationVenueId = venue.id
    visitor.leisureArrivedAtMs = undefined
    context.clearPassage(key)
    context.agents.set(key, visitor)
  }
}
