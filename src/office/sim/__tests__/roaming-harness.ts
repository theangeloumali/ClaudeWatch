import { agentKey } from '../../../shared/office/agent-key'
import { crosswalks } from '../../../shared/office/crosswalks'
import { pedestrianGround, sidewalkNetwork } from '../../../shared/office/sidewalks'
import type { AgentView, SessionRef, SourceHealth } from '../../../shared/office/types'
import { createWorldDocument } from '../../../shared/office/world-document'
import type { WorldPoint } from '../../../shared/office/world-document-types'
import { LOUNGE_DELAY_MS } from '../behaviour'
import { resolveEffectiveWorld } from '../effective-world'
import { session, subagent } from '../fixtures'
import type { LayoutMap, Slot } from '../layout'
import { World } from '../world'
import { floorEntrance } from '../world-floor-routes'
import type { WorldVenue } from '../world-venues'
import { TICK_MS } from './door-invariants'

const SOURCE_ID = 'source'
const SEAT_METRES = 0.16
// A step this short is a jostle, not a walk; only real walking has a direction.
const WALK_STEP_METRES = 0.05
// Fillets turn within a turn radius of a junction, so direction is judged mid-run only.
const RUN_END_METRES = 2
const ON_RUN_METRES = 0.6
const DOOR_METRES = 3

export const SOURCES: SourceHealth[] = [{ id: SOURCE_ID, ok: true, detail: '' }]

// A session as the observing bridge stamps it: its own record, fresh at `nowMs`.
export function observed(key: string, project: string, nowMs: number): SessionRef {
  return {
    ...session(key, project),
    observation: {
      sourceId: SOURCE_ID,
      coverage: 'own',
      observedAtMs: nowMs,
      staleAfterMs: 3_600_000
    }
  }
}

// `count` idle agents in one project, each with its own fresh record.
export const idle =
  (count: number, project = 'p_roam') =>
  (nowMs: number): SessionRef[] =>
    Array.from({ length: count }, (_, index) => observed(`claude:idle-${index}`, project, nowMs))

// The live feed's venue targets: footprint-relative entrances and seats made absolute.
function venueTargets(layout: LayoutMap): WorldVenue[] {
  return (layout.effectiveVenues ?? []).map((venue) => ({
    id: venue.id,
    kind: venue.kind,
    capacity: venue.capacity,
    entrance: { x: venue.footprint.x + venue.entrance.x, z: venue.footprint.z + venue.entrance.z },
    slots: venue.slots.map((slot) => ({
      ...slot,
      x: slot.x + venue.footprint.x,
      z: slot.z + venue.footprint.z
    }))
  }))
}

const resolveLayout = (base: LayoutMap, current: readonly SessionRef[]): LayoutMap =>
  resolveEffectiveWorld(base, createWorldDocument(base, current), current)

// The city as the live Office runs it: effective world, venue targets and its own clock.
export class CityWorld {
  clock = 1_000_000
  readonly world: World
  private sequence = 1

  constructor(
    sessions: (nowMs: number) => SessionRef[],
    options: { hasVenues: boolean; sources?: SourceHealth[] }
  ) {
    let layout: LayoutMap | undefined
    this.world = new World({
      resolveLayout: (base, current) => (layout = resolveLayout(base, current)),
      getVenueTargets: () => (options.hasVenues && layout ? venueTargets(layout) : []),
      now: () => this.clock
    })
    this.world.apply({
      type: 'hello',
      v: 1,
      snapshot: {
        rev: 1,
        generatedAtMs: this.clock,
        sessions: sessions(this.clock),
        sources: options.sources ?? SOURCES
      }
    })
  }

  patch(upserts: SessionRef[]): void {
    this.world.apply({ type: 'patch', v: 1, seq: ++this.sequence, upserts, removed: [] })
  }

  step(): AgentView[] {
    this.clock += TICK_MS
    return this.world.step(TICK_MS)
  }

  run(ms: number, onFrame: (views: AgentView[], elapsedMs: number) => boolean | void): void {
    for (let elapsed = TICK_MS; elapsed <= ms; elapsed += TICK_MS)
      if (onFrame(this.step(), elapsed) === true) return
  }

  deskOf(view: AgentView): Slot | undefined {
    return this.world
      .layout()
      .floors.find((floor) => floor.id === view.floorId)
      ?.rooms.find((room) => room.id === view.roomId)
      ?.slots.find((slot) => slot.id === view.slotId)
  }

  isSeated(view: AgentView | undefined): boolean {
    const desk = view && this.deskOf(view)
    return (
      !!view &&
      !!desk &&
      view.place === undefined &&
      view.physicalFloorId === view.floorId &&
      Math.hypot(view.x - desk.x, view.z - desk.z) <= SEAT_METRES
    )
  }
}

// The streets the sim reads, judged the way the sidewalk network was built (Phase 3).
export function streetsOf(layout: LayoutMap) {
  const roads = layout.streets ?? []
  const network = sidewalkNetwork(roads, crosswalks(roads))
  const ground = pedestrianGround(network, { x: 0, z: 0, width: 0, depth: 0 })
  const runs = network.edges
    .filter((edge) => edge.kind === 'run')
    .map((edge) => [network.nodes[edge.from], network.nodes[edge.to]] as const)
  // The unit direction of the one-way run under `point`, away from its ends.
  const runDirectionAt = (point: WorldPoint): WorldPoint | null => {
    for (const [from, to] of runs) {
      const length = Math.hypot(to.x - from.x, to.z - from.z)
      const unit = { x: (to.x - from.x) / length, z: (to.z - from.z) / length }
      const along = (point.x - from.x) * unit.x + (point.z - from.z) * unit.z
      const across = Math.abs((point.x - from.x) * unit.z - (point.z - from.z) * unit.x)
      if (along > RUN_END_METRES && along < length - RUN_END_METRES && across < ON_RUN_METRES)
        return unit
    }
    return null
  }
  // Within a body's width of a walk: on the sidewalk network rather than at a door or venue.
  const isOnNetwork = (point: WorldPoint): boolean =>
    network.edges.some((edge) => {
      if (edge.kind === 'hop') return false
      const [a, b] = [network.nodes[edge.from], network.nodes[edge.to]]
      const length = Math.hypot(b.x - a.x, b.z - a.z) || 1
      const t = Math.max(
        0,
        Math.min(1, ((point.x - a.x) * (b.x - a.x) + (point.z - a.z) * (b.z - a.z)) / length ** 2)
      )
      return Math.hypot(point.x - (a.x + (b.x - a.x) * t), point.z - (a.z + (b.z - a.z) * t)) < 0.8
    })
  return {
    hasStreets: roads.length > 0,
    isOnAsphalt: (point: WorldPoint): boolean => !ground.isOpen(point),
    isOnNetwork,
    // A walking step against its run's one-way direction (A3).
    isAgainstFlow: (from: WorldPoint, to: WorldPoint): boolean => {
      const step = { x: to.x - from.x, z: to.z - from.z }
      const length = Math.hypot(step.x, step.z)
      const unit = length > WALK_STEP_METRES ? runDirectionAt(from) : null
      return !!unit && (step.x * unit.x + step.z * unit.z) / length < -0.5
    }
  }
}

// Out of its building on a city outing: a roamer or a venue visitor, not a commuter.
export const isOuting = (view: AgentView): boolean =>
  view.place === 'lounge' && view.physicalFloorId === null

const crew = (generation: number) =>
  Array.from({ length: 6 }, (_, index) => ({
    ...subagent(`g${generation}-${index}`),
    activity: 'running' as const
  }))

// A lead keeps working while `roamers` idle peers set out; once all are on the sidewalks the
// crew swaps and every peer is called back.
export function doorSwap(roamers: number) {
  let lead: SessionRef = { ...session('claude:lead', 'p_roam'), activity: 'running' }
  const peers = idle(roamers)
  const city = new CityWorld((nowMs) => [{ ...lead, subagents: crew(0) }, ...peers(nowMs)], {
    hasVenues: false
  })
  const streets = streetsOf(city.world.layout())
  const peerKeys = peers(0).map((peer) => peer.key)
  const viewOf = (frame: AgentView[], key: string) => frame.find((view) => view.agentKey === key)
  let views: AgentView[] = []
  city.run(LOUNGE_DELAY_MS + 120_000, (frame) => {
    views = frame
    return peerKeys.every((key) => {
      const view = viewOf(frame, key)
      return !!view && isOuting(view) && streets.isOnNetwork(view)
    })
  })
  const allOut = peerKeys.every((key) => viewOf(views, key)?.place === 'lounge')
  const leadFloorId = viewOf(views, lead.key)?.floorId
  const leadFloor = city.world.layout().floors.find((floor) => floor.id === leadFloorId)
  const entrance = leadFloor ? floorEntrance(leadFloor) : { x: Infinity, z: Infinity }
  const departed = new Set(crew(0).map((member) => agentKey(lead.key, member.id)))
  lead = { ...lead, subagents: crew(1) }
  city.patch([
    lead,
    ...peers(city.clock).map((peer) => ({ ...peer, activity: 'thinking' as const }))
  ])
  const arriving = [...crew(1).map((member) => agentKey(lead.key, member.id)), ...peerKeys]
  let doorClearAtMs: number | null = null
  let busySinceMs: number | null = null
  let longestBusyMs = 0
  city.run(150_000, (frame, elapsedMs) => {
    views = frame
    const isAtDoor = (view: AgentView) =>
      !city.isSeated(view) && Math.hypot(view.x - entrance.x, view.z - entrance.z) < DOOR_METRES
    const isDoorClear =
      frame.every((view) => !departed.has(view.agentKey)) &&
      arriving.every((key) => viewOf(frame, key)) &&
      !frame.some(isAtDoor)
    if (isDoorClear) doorClearAtMs ??= elapsedMs
    busySinceMs = frame.some(isAtDoor) ? (busySinceMs ?? elapsedMs) : null
    longestBusyMs = Math.max(longestBusyMs, busySinceMs === null ? 0 : elapsedMs - busySinceMs)
  })
  return {
    allOut,
    isDoorClearWithin30s: (doorClearAtMs ?? Infinity) <= 30_000,
    isDoorNeverBusy30s: longestBusyMs < 30_000,
    unseated: arriving.filter((key) => !city.isSeated(viewOf(views, key)))
  }
}
