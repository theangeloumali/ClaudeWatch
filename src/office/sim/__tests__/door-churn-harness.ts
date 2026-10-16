import { agentKey } from '../../../shared/office/agent-key'
import type { AgentView, SessionRef, SourceHealth, SubagentRef } from '../../../shared/office/types'
import { createWorldDocument } from '../../../shared/office/world-document'
import { resolveEffectiveWorld } from '../effective-world'
import { session, subagent } from '../fixtures'
import { buildLayout, type LayoutMap } from '../layout'
import { World } from '../world'
import type { Point } from '../path'
import { floorEntrance } from '../world-floor-routes'
import type { WorldVenue } from '../world-venues'
import { DoorInvariants, TICK_MS } from './door-invariants'

const CREW = 6
const SWAP_EVERY_MS = 10_000
const CHURN_MS = 120_000
const QUIET_MS = 90_000
const SEAT_METRES = 0.16
const SOURCES: SourceHealth[] = [{ id: 'source', ok: true, detail: '' }]

const resolveLayout = (base: LayoutMap, current: readonly SessionRef[]): LayoutMap =>
  resolveEffectiveWorld(base, createWorldDocument(base, current), current)

// Only the venue nearest the lobby, so a round trip fits inside the churn window.
function nearestVenue(sessions: readonly SessionRef[], entrance: Point): WorldVenue[] {
  const document = createWorldDocument(buildLayout([...sessions], undefined), sessions)
  const venues = document.venues.map((venue) => ({
    id: venue.id,
    kind: venue.kind,
    capacity: venue.capacity,
    entrance: {
      x: venue.footprint.x + venue.entrance.x,
      z: venue.footprint.z + venue.entrance.z
    },
    slots: venue.slots.map((slot) => ({
      ...slot,
      x: venue.footprint.x + slot.x,
      z: venue.footprint.z + slot.z
    }))
  }))
  const distance = (venue: WorldVenue): number =>
    Math.hypot(venue.entrance.x - entrance.x, venue.entrance.z - entrance.z)
  return venues.sort((first, second) => distance(first) - distance(second)).slice(0, 1)
}

export interface ChurnOptions {
  kind?: SubagentRef['kind']
  // Peers idle with fresh own evidence, so the roam rule sends them through the lobby door.
  hasRoamingPeers?: boolean
}

// A lead's crew of six swaps every 10 s for 120 s, then 90 s of quiet (seating-1…4).
export function runDoorChurn({ kind, hasRoamingPeers = false }: ChurnOptions) {
  let clock = 1_000_000
  const observation = {
    sourceId: 'source',
    coverage: 'own' as const,
    observedAtMs: clock,
    staleAfterMs: 3_600_000
  }
  const crew = (generation: number): SubagentRef[] =>
    Array.from({ length: CREW }, (_, index) => ({
      ...subagent(`g${generation}-${index}`, kind),
      activity: 'running' as const
    }))
  const peers = ['claude:peer-a', 'claude:peer-b'].map((key) =>
    hasRoamingPeers ? { ...session(key, 'p_app'), observation } : session(key, 'p_app')
  )
  let lead: SessionRef = {
    ...session('claude:lead', 'p_app'),
    activity: 'running',
    subagents: crew(0)
  }
  let venues: WorldVenue[] = []
  const world = new World({
    resolveLayout,
    loungeTrips: hasRoamingPeers,
    getVenueTargets: () => venues,
    now: () => clock
  })
  world.apply({
    type: 'hello',
    v: 1,
    snapshot: {
      rev: 1,
      generatedAtMs: clock,
      sessions: [lead, ...peers],
      sources: hasRoamingPeers ? SOURCES : []
    }
  })
  let layout = world.layout()
  const leadFloorId = world.step(0).find((view) => view.agentKey === lead.key)?.floorId
  const lobby = layout.floors.find((floor) => floor.id === leadFloorId)
  if (hasRoamingPeers && lobby) venues = nearestVenue([lead, ...peers], floorEntrance(lobby))
  const seatOf = (view: AgentView) =>
    layout.floors
      .find((floor) => floor.id === view.floorId)
      ?.rooms.find((room) => room.id === view.roomId)
      ?.slots.find((slot) => slot.id === view.slotId)
  const isSeated = (view: AgentView): boolean => {
    const seat = seatOf(view)
    return seat !== undefined && Math.hypot(view.x - seat.x, view.z - seat.z) <= SEAT_METRES
  }
  const invariants = new DoorInvariants((view) => view.venueId !== undefined || isSeated(view))
  const departed = new Set<string>()
  const peerKeys = new Set(peers.map((peer) => peer.key))
  const setOut = new Set<string>()
  const wentOut = new Set<string>()
  const returned = new Set<string>()
  let generation = 0
  let sequence = 1
  let views: AgentView[] = []
  for (let elapsed = TICK_MS; elapsed <= CHURN_MS + QUIET_MS; elapsed += TICK_MS) {
    clock += TICK_MS
    if (elapsed % SWAP_EVERY_MS === 0 && elapsed <= CHURN_MS) {
      for (const member of lead.subagents) departed.add(agentKey(lead.key, member.id))
      lead = { ...lead, subagents: crew(++generation) }
      world.apply({ type: 'patch', v: 1, seq: ++sequence, upserts: [lead], removed: [] })
      layout = world.layout()
    }
    views = world.step(TICK_MS)
    invariants.check(views, elapsed)
    for (const view of views) {
      if (!peerKeys.has(view.agentKey)) continue
      if (view.place === 'lounge') setOut.add(view.agentKey)
      if (view.physicalFloorId === null) wentOut.add(view.agentKey)
      else if (wentOut.has(view.agentKey)) returned.add(view.agentKey)
    }
  }
  const unseated = lead.subagents.filter((member) => {
    const view = views.find((candidate) => candidate.agentKey === agentKey(lead.key, member.id))
    return !view || !isSeated(view)
  })
  return {
    stillInside: views.filter((view) => departed.has(view.agentKey)).length,
    unseated: unseated.length,
    roamersSetOut: setOut.size,
    roamersReturned: returned.size,
    ...invariants.report()
  }
}

export const CLEARED = { stillInside: 0, unseated: 0, overlap: null, jump: null, blocked: null }
