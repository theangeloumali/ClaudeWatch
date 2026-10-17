import { agentKey } from '../../../shared/office/agent-key'
import type { AgentView, SessionRef, SourceHealth, SubagentRef } from '../../../shared/office/types'
import { createWorldDocument } from '../../../shared/office/world-document'
import { resolveEffectiveWorld } from '../effective-world'
import { session, subagent } from '../fixtures'
import type { LayoutMap } from '../layout'
import type { Point } from '../path'
import { World } from '../world'
import { floorEntrance } from '../world-floor-routes'
import { DoorInvariants, TICK_MS } from './door-invariants'

const CREW = 6
const SWAP_EVERY_MS = 10_000
const CHURN_MS = 120_000
const QUIET_MS = 90_000
const SEAT_METRES = 0.16
const DOOR_METRES = 3
const SOURCES: SourceHealth[] = [{ id: 'source', ok: true, detail: '' }]

const resolveLayout = (base: LayoutMap, current: readonly SessionRef[]): LayoutMap =>
  resolveEffectiveWorld(base, createWorldDocument(base, current), current)

export interface ChurnOptions {
  kind?: SubagentRef['kind']
  // Peers idle with fresh own evidence, so the lounge rule sends them off for a seat.
  hasLoungingPeers?: boolean
}

// A lead with a crew of six and two peers on one floor whose only door is the lobby's.
export class DoorWorld {
  clock = 1_000_000
  readonly world: World
  readonly peers: SessionRef[]
  readonly entrance: Point
  lead: SessionRef
  private layout: LayoutMap
  private sequence = 1

  constructor(private readonly options: ChurnOptions) {
    const observation = {
      sourceId: 'source',
      coverage: 'own' as const,
      observedAtMs: this.clock,
      staleAfterMs: 3_600_000
    }
    this.peers = ['claude:peer-a', 'claude:peer-b'].map((key) =>
      options.hasLoungingPeers ? { ...session(key, 'p_app'), observation } : session(key, 'p_app')
    )
    this.lead = { ...session('claude:lead', 'p_app'), activity: 'running', subagents: this.crew(0) }
    this.world = new World({
      resolveLayout,
      loungeTrips: options.hasLoungingPeers ?? false,
      now: () => this.clock
    })
    this.world.apply({
      type: 'hello',
      v: 1,
      snapshot: {
        rev: 1,
        generatedAtMs: this.clock,
        sessions: [this.lead, ...this.peers],
        sources: options.hasLoungingPeers ? SOURCES : []
      }
    })
    this.layout = this.world.layout()
    const leadFloorId = this.world.step(0).find((view) => view.agentKey === this.lead.key)?.floorId
    const lobby = this.layout.floors.find((floor) => floor.id === leadFloorId)!
    this.entrance = floorEntrance(lobby)
  }

  crew(generation: number): SubagentRef[] {
    return Array.from({ length: CREW }, (_, index) => ({
      ...subagent(`g${generation}-${index}`, this.options.kind),
      activity: 'running' as const
    }))
  }

  crewKeys(): string[] {
    return this.lead.subagents.map((member) => agentKey(this.lead.key, member.id))
  }

  patch(upserts: SessionRef[], removed: string[] = []): void {
    this.world.apply({ type: 'patch', v: 1, seq: ++this.sequence, upserts, removed })
    this.layout = this.world.layout()
  }

  step(): AgentView[] {
    this.clock += TICK_MS
    return this.world.step(TICK_MS)
  }

  isLounging(view: AgentView | undefined): boolean {
    const seats = this.layout.floors.flatMap((floor) =>
      floor.zones.flatMap((zone) => zone.lounge?.slots ?? [])
    )
    return (
      view?.place === 'lounge' &&
      seats.some((seat) => Math.hypot(view.x - seat.x, view.z - seat.z) <= SEAT_METRES)
    )
  }

  isSeated(view: AgentView | undefined): boolean {
    const seat = this.layout.floors
      .find((floor) => floor.id === view?.floorId)
      ?.rooms.find((room) => room.id === view?.roomId)
      ?.slots.find((slot) => slot.id === view?.slotId)
    return !!view && !!seat && Math.hypot(view.x - seat.x, view.z - seat.z) <= SEAT_METRES
  }
}

// The crew swaps every 10 s for 120 s, then 90 s of quiet (seating-1…4).
export function runDoorChurn(options: ChurnOptions) {
  const door = new DoorWorld(options)
  const invariants = new DoorInvariants((view) => door.isLounging(view) || door.isSeated(view))
  const departed = new Set<string>()
  const peerKeys = new Set(door.peers.map((peer) => peer.key))
  const setOut = new Set<string>()
  const wentOutside = new Set<string>()
  let generation = 0
  let views: AgentView[] = []
  for (let elapsed = TICK_MS; elapsed <= CHURN_MS + QUIET_MS; elapsed += TICK_MS) {
    if (elapsed % SWAP_EVERY_MS === 0 && elapsed <= CHURN_MS) {
      for (const key of door.crewKeys()) departed.add(key)
      door.lead = { ...door.lead, subagents: door.crew(++generation) }
      door.patch([door.lead])
    }
    views = door.step()
    invariants.check(views, elapsed)
    for (const view of views) {
      if (!peerKeys.has(view.agentKey)) continue
      if (view.place === 'lounge') setOut.add(view.agentKey)
      if (view.physicalFloorId === null) wentOutside.add(view.agentKey)
    }
  }
  return {
    stillInside: views.filter((view) => departed.has(view.agentKey)).length,
    unseated: door
      .crewKeys()
      .filter((key) => !door.isSeated(views.find((view) => view.agentKey === key))).length,
    loungersSetOut: setOut.size,
    loungersOutside: wentOutside.size,
    ...invariants.report()
  }
}

// Both peers sit in the lounge; then one crew swap while work calls both back (Review Focus 1).
// The door is clear once the leavers are gone, the crew is in and nobody stands near it.
export function runMixedSwap(seatWithinMs: number) {
  const door = new DoorWorld({ hasLoungingPeers: true })
  const isLounging = (views: AgentView[]) =>
    door.peers.every((peer) => door.isLounging(views.find((view) => view.agentKey === peer.key)))
  let views = door.step()
  for (let elapsed = 0; elapsed < 120_000 && !isLounging(views); elapsed += TICK_MS)
    views = door.step()
  const loungersSeated = isLounging(views)
  const departed = new Set(door.crewKeys())
  door.lead = { ...door.lead, subagents: door.crew(1) }
  door.patch([door.lead, ...door.peers.map((peer) => ({ ...peer, activity: 'thinking' as const }))])
  const arriving = [...door.crewKeys(), ...door.peers.map((peer) => peer.key)]
  let doorClearAtMs: number | null = null
  for (let elapsed = TICK_MS; elapsed <= seatWithinMs; elapsed += TICK_MS) {
    views = door.step()
    const isDoorClear =
      views.every((view) => !departed.has(view.agentKey)) &&
      arriving.every((key) => views.some((view) => view.agentKey === key)) &&
      views.every(
        (view) => Math.hypot(view.x - door.entrance.x, view.z - door.entrance.z) >= DOOR_METRES
      )
    if (isDoorClear) doorClearAtMs ??= elapsed
  }
  return {
    loungersSeated,
    doorClearAtMs,
    unseated: arriving.filter((key) => !door.isSeated(views.find((view) => view.agentKey === key)))
      .length
  }
}

export const CLEARED = { stillInside: 0, unseated: 0, overlap: null, jump: null, blocked: null }
