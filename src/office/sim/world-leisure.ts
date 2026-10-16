import { observeAgent } from '../../shared/office/observation'
import { parseAgentKey } from '../../shared/office/agent-key'
import type { SessionRef, SourceHealth } from '../../shared/office/types'
import { goToLounge, returnToDesk, setFinished, wantsLounge, type AgentRecord } from './behaviour'
import type { FloorLayout, LayoutMap, LoungeLayout } from './layout'
import { loungeSeats } from './lounge'
import type { Point } from './path'
import type { RoamOutings } from './roaming'
import type { FloorRoutes, FloorWaypoint } from './world-floor-routes'
import type { VenueBookings, WorldVenue } from './world-venues'

const VENUE_STAY_MS = 16_000
// A loop has no seat: its walker keeps the desk heading it will sit back down to.
const LOOP_SEAT_ID = 'loop'

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
  roaming: RoamOutings
  clearPassage: (key: string) => void
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

// The way back to its desk from the street: along the sidewalks to its building's doorstep,
// then the floor routes indoors (P5).
export function homeRoute(
  agent: AgentRecord,
  floor: FloorLayout,
  desk: Point,
  routes: FloorRoutes,
  venues: readonly WorldVenue[]
): FloorWaypoint[] {
  const { view } = agent
  if (view.physicalFloorId !== null || (view.elevation ?? 0) !== 0 || !routes.hasSidewalks())
    return routes.toFloor(view, floor, desk)
  const venue = venues.find(
    (candidate) => candidate.id === (view.venueId ?? agent.destinationVenueId)
  )
  // Past its venue's door, it leaves the way it came in.
  const start = venue && (view.venueId || agent.path.length <= 1) ? venue.entrance : view
  const doorstep = routes.doorstep(floor)
  const walk = routes.sidewalkPath(start, doorstep)
  const indoors = routes.toFloor(
    { ...view, ...doorstep, elevation: 0, physicalFloorId: null },
    floor,
    desk
  )
  return walk.length && indoors.length ? [...walk, ...indoors] : routes.toFloor(view, floor, desk)
}

function returnHome(agent: AgentRecord, context: Leisure): void {
  const key = agent.view.agentKey
  const floor = context.map.floors.find((candidate) => candidate.id === agent.view.floorId)
  const desk = floor?.rooms
    .find((room) => room.id === agent.view.roomId)
    ?.slots.find((slot) => slot.id === agent.view.slotId)
  if (!floor || !desk || agent.state === 'leaving') return
  const route = homeRoute(agent, floor, desk, context.routes, context.venues)
  if (!route.length) return
  context.bookings.release(key)
  context.roaming.end(key)
  context.clearPassage(key)
  // Disabling trips does not restart legacy work; advanced visits retain their cooldown.
  const returning = returnToDesk(agent, desk.heading, route)
  context.agents.set(
    key,
    leisureMode(agent, context) === 'legacy' ? returning : setFinished(returning, false)
  )
}

// Sends idle agents out (a venue or a loop, in turn), and calls them home when work, unknown
// activity or the switch says so.
export function reconcileLeisure(leisureContext: LeisureContext): void {
  const { agents, roaming } = leisureContext
  roaming.prune(
    (key) => agents.get(key)?.view.place === 'lounge',
    (key) => agents.has(key)
  )
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
  const venues = context.hasTrips ? context.venues : []
  const canRoam = context.hasTrips && context.routes.hasSidewalks()
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
      if (roaming.isRoaming(key)) returnHome(agent, context)
      else if (agent.leisureArrivedAtMs === undefined) {
        agent.leisureArrivedAtMs = context.nowMs
        if (agent.destinationVenueId) agent.view.venueId = agent.destinationVenueId
      } else if (context.nowMs - agent.leisureArrivedAtMs >= VENUE_STAY_MS)
        returnHome(agent, context)
    }
  }
  const loungeAgents = [...context.agents.values()]
    .filter(
      (agent) =>
        !agent.destinationVenueId &&
        !agent.view.venueId &&
        !roaming.isRoaming(agent.view.agentKey) &&
        !((venues.length || canRoam) && modes.get(agent.view.agentKey) === 'advanced')
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
      context.hasTrips &&
      modes.get(agent.view.agentKey) === 'advanced' &&
      agent.state !== 'leaving' &&
      !roaming.isRoaming(agent.view.agentKey) &&
      // Out already, or its turn for a venue, or no loop to walk instead.
      (agent.view.place === 'lounge' ||
        !roaming.prefersLoop(agent.view.agentKey) ||
        !canRoam ||
        !roaming.hasRoom())
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
    const street = context.routes.sidewalkPath(route.at(-1) ?? agent.view, venue.entrance)
    if (!street.length) {
      context.bookings.release(key)
      continue
    }
    route.push(...street, { ...seat, elevation: 0, physicalFloorId: null })
    if (agent.view.place !== 'lounge') roaming.begin(key, false)
    const visitor = goToLounge(agent, seat, route)
    visitor.destinationVenueId = venue.id
    visitor.leisureArrivedAtMs = undefined
    context.clearPassage(key)
    context.agents.set(key, visitor)
  }
  if (canRoam) sendRoamers(context, modes)
}

// Idle agents whose turn is a loop, or who found no venue seat, walk one while there is room.
function sendRoamers(context: Leisure, modes: ReadonlyMap<string, string>): void {
  const keys = [...context.agents.keys()].sort((first, second) => first.localeCompare(second))
  keys.forEach((key, rank) => {
    const agent = context.agents.get(key)
    if (!agent || modes.get(key) !== 'advanced' || !wantsLounge(agent)) return
    if (!context.roaming.hasRoom()) return
    const floor =
      context.routes.floor(agent.view.physicalFloorId) ?? context.routes.floor(agent.view.floorId)
    const out = floor ? context.routes.toGround(agent.view, floor) : []
    // Rank spreads agents over the nearby loops; each outing moves it on to the next.
    const loop = out.length
      ? context.routes.roam(out.at(-1) ?? agent.view, rank + context.roaming.outings(key))
      : []
    if (!loop.length) return
    context.roaming.begin(key, true)
    context.clearPassage(key)
    context.agents.set(
      key,
      goToLounge(agent, { id: LOOP_SEAT_ID, heading: agent.slotHeading }, [...out, ...loop])
    )
  })
}
