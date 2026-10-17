import {
  DEPARTURE_FADE_MS,
  type AgentView,
  type FeedMessage,
  type SessionRef,
  type SourceHealth
} from '../../shared/office/types'
import { clamp } from '../../shared/range'
import { BodyPassages } from '../../shared/office/body-passages'
import { bodyStep, type BodyFootprint } from '../../shared/office/body-footprints'
import { agentBody } from './agent-body'
import {
  createAgent,
  leaveAgent,
  returnToDesk,
  setFinished,
  tickAgent,
  updateAgent,
  type AgentRecord
} from './behaviour'
import { buildLayout, type FloorLayout, type LayoutMap, type LoungeLayout } from './layout'
import { loungesByRoom } from './lounge'
import { MovementRecovery } from './movement-recovery'
import { placements, type Placement } from './placements'
import { FloorRoutes, floorElevation } from './world-floor-routes'
import { reconcileLeisure } from './world-leisure'
import { seatAtDesk } from './world-recall'
import {
  recoverWorkerRoute,
  resumeUnseatedWorker,
  relayoutWorker,
  waitCycleLeaders,
  waitsForMovingBody,
  workerNavigation
} from './worker-navigation'

const TICK_MS = 100

export class World {
  private readonly routes = new FloorRoutes()
  private baseline: LayoutMap = { version: 1, floors: [], reservations: {} }
  private sources: readonly SourceHealth[] = []
  private nowMs = 0
  private sessions = new Map<string, SessionRef>()
  private agents = new Map<string, AgentRecord>()
  private bodyObstacles: readonly BodyFootprint[] = []
  private readonly recovery = new MovementRecovery()
  private readonly members = new Map<string, Placement['member']>()
  // Agents fading where they stand, with how long each has faded. A leaver goes; any other
  // reappears at its desk: a newcomer, a desk moved off its floor, or a recall (FOUND 7).
  private readonly fading = new Map<string, number>()
  private readonly passages = new BodyPassages()
  // Who waited on whom last tick, and who could have stepped; one of each cycle steps now.
  private waitEdges = new Map<string, string>()
  private steppable = new Set<string>()
  private cycleLeaders = new Set<string>()
  private movementTick = 0
  private map: LayoutMap = { version: 1, floors: [], reservations: {} }
  // From storage: read for order and bays by the first build, never walked on.
  private savedMap: LayoutMap | undefined
  // The floor `lounges` were made for.
  private floorJson = ''
  private lounges = new Map<string, LoungeLayout>()
  private accumulatedMs = 0
  private sequence = -1
  private helloRevision = 0
  private ready = false
  private hasLoungeTrips: boolean

  // `loungeTrips: false` keeps finished agents at their desks.
  constructor(
    private readonly options: {
      saved?: LayoutMap
      loungeTrips?: boolean
      resolveLayout?: (baseLayout: LayoutMap, sessions: readonly SessionRef[]) => LayoutMap
      // dead-code-allowed: live-feed.ts still passes venues; the lead drops both at integration 2026-10-24
      getVenueTargets?: () => readonly unknown[]
      now?: () => number
    } = {}
  ) {
    this.hasLoungeTrips = options.loungeTrips ?? true
    this.savedMap = options.saved && structuredClone(options.saved)
  }

  apply(message: FeedMessage): void {
    this.syncClock()
    if (message.type === 'resync') {
      this.ready = false
      return
    }
    // Nothing is kept until every agent has a place, so a message that cannot be placed leaves
    // the world as it was and the next one still applies.
    let sessions: Map<string, SessionRef>
    let helloRevision = this.helloRevision
    let sequence: number
    if (message.type === 'hello') {
      sessions = new Map(message.snapshot.sessions.map((s) => [s.key, structuredClone(s)]))
      // A patch's seq is the revision it produces, so anything at or below this one is stale.
      helloRevision = sequence = message.snapshot.rev
    } else {
      if (!this.ready || message.seq <= this.sequence) return
      sessions = new Map(this.sessions)
      for (const key of message.removed) sessions.delete(key)
      for (const session of message.upserts) sessions.set(session.key, structuredClone(session))
      sequence = message.seq
    }
    this.reconcile(sessions, message.type === 'hello' && this.sequence === -1)
    this.helloRevision = helloRevision
    this.sequence = sequence
    this.ready = true
    this.sources =
      message.type === 'hello'
        ? structuredClone(message.snapshot.sources)
        : structuredClone(message.sources ?? this.sources)
    if (message.type === 'hello') this.nowMs = Math.max(this.nowMs, message.snapshot.generatedAtMs)
    this.seatLounges()
  }

  refreshLayout(): void {
    this.syncClock()
    this.reconcile(this.sessions, false)
    this.seatLounges()
  }

  baseLayout(): LayoutMap {
    return structuredClone(this.baseline)
  }

  private syncClock(): void {
    const current = this.options.now?.()
    if (current !== undefined && Number.isFinite(current))
      this.nowMs = Math.max(this.nowMs, current)
  }

  private reconcile(sessions: Map<string, SessionRef>, isInitial: boolean): void {
    const oldMap = this.map
    const baseline = buildLayout([...sessions.values()], this.savedMap ?? this.baseline)
    const map =
      this.options.resolveLayout?.(structuredClone(baseline), [...sessions.values()]) ?? baseline
    const held = new Map(
      [...this.agents]
        .filter(([, agent]) => agent.state !== 'leaving')
        .map(([key, agent]) => [key, agent.view])
    )
    const desired = placements([...sessions.values()], map, held)
    this.sessions = sessions
    this.map = map
    this.baseline = baseline
    this.savedMap = undefined
    this.routes.update(this.map)
    const floorJson = JSON.stringify(this.map.floors)
    if (floorJson !== this.floorJson) {
      this.lounges = new Map(this.map.floors.flatMap((floor) => [...loungesByRoom(floor)]))
      this.floorJson = floorJson
    }
    const active = new Set(desired.map((p) => p.session.key))
    // Every leaver fades where it stands: walking out is what jammed the street door.
    for (const [key, agent] of this.agents)
      if (!active.has(key) && agent.state !== 'leaving') this.fadeOut(key, leaveAgent(agent))
    const oldRooms = new Map(
      oldMap.floors.flatMap((floor) =>
        floor.rooms.map((room) => [`${floor.id}\n${room.id}`, room] as const)
      )
    )
    for (const placement of desired) {
      const { session, room, slot, floorId } = placement
      this.members.set(session.key, placement.member)
      const isFinished =
        placement.isFinished ||
        (session.observation?.coverage === 'own' &&
          (session.attention === 'none' || session.attention === 'done') &&
          (session.activity === 'idle' || session.attention === 'done'))
      const floor = this.map.floors.find((candidate) => candidate.id === floorId)!
      const previousAgent = this.agents.get(session.key)
      const existing =
        previousAgent && this.options.resolveLayout
          ? relayoutWorker({
              agent: previousAgent,
              previousFloors: oldMap.floors,
              floors: map.floors
            })
          : previousAgent
      // In the lounge, or fading in or out: it goes to the desk the map gives it now.
      if (
        existing &&
        existing.state !== 'leaving' &&
        (existing.view.place === 'lounge' || this.fading.has(session.key))
      ) {
        const updated = setFinished(
          updateAgent(existing, session.activity, session.attention),
          isFinished
        )
        Object.assign(updated.view, {
          floorId,
          roomId: room.id,
          slotId: slot.id,
          label: session.name
        })
        if (!isFinished) this.passages.clear(session.key)
        const staysAway = isFinished && existing.view.physicalFloorId === floorId
        this.agents.set(session.key, staysAway ? updated : this.callHome(updated, floor, slot))
        continue
      }
      const oldSlot = oldRooms
        .get(`${existing?.view.floorId ?? floorId}\n${room.id}`)
        ?.slots.find((s) => s.id === slot.id)
      if (
        existing &&
        oldSlot &&
        existing.state !== 'leaving' &&
        existing.view.roomId === room.id &&
        existing.view.slotId === slot.id &&
        existing.view.floorId === floorId &&
        (existing.path.length > 0 || (existing.view.elevation ?? 0) === floorElevation(floor))
      ) {
        const hasSeatMoved = oldSlot.x !== slot.x || oldSlot.z !== slot.z
        const isSeated =
          existing.path.length === 0 &&
          existing.view.x === oldSlot.x &&
          existing.view.z === oldSlot.z
        if (!hasSeatMoved || (isSeated && !this.options.resolveLayout)) {
          const updated = updateAgent(existing, session.activity, session.attention)
          updated.view.label = session.name
          // Its office slid along with a neighbour that grew: it goes with its desk, seated.
          if (hasSeatMoved) Object.assign(updated.view, { x: slot.x, z: slot.z })
          this.agents.set(session.key, setFinished(updated, isFinished))
          continue
        }
      }
      this.agents.set(
        session.key,
        setFinished(this.toNewDesk(placement, floor, existing, isInitial), isFinished)
      )
    }
  }

  // Initial actors are seated and later arrivals materialise there. A desk on its own floor
  // is a walk; one on another floor or building, or with no way through, fades across.
  private toNewDesk(
    { session, room, slot, floorId, isSubagent }: Placement,
    floor: FloorLayout,
    existing: AgentRecord | undefined,
    isInitial: boolean
  ): AgentRecord {
    const key = session.key
    const agent = createAgent(
      session,
      {
        floorId,
        roomId: room.id,
        slotId: slot.id,
        x: slot.x,
        z: slot.z,
        heading: slot.heading,
        elevation: floorElevation(floor),
        physicalFloorId: floorId
      },
      []
    )
    agent.view.isSubagent = isSubagent
    this.passages.clear(key)
    this.fading.delete(key)
    if (!existing) {
      this.recovery.clear(key)
      if (!isInitial) this.startFade(key)
      return agent
    }
    // A desk that moved does not restart its wait for the lounge.
    agent.finishedForMs = existing.finishedForMs
    agent.path = this.routes.toFloor(existing.view, floor, slot)
    Object.assign(agent.view, {
      x: existing.view.x,
      z: existing.view.z,
      elevation: existing.view.elevation,
      physicalFloorId: existing.view.physicalFloorId
    })
    if (!agent.path.length) this.startFade(key)
    return agent
  }

  private bodies(): BodyFootprint[] {
    return [...this.agents.values()]
      .map((agent) => agentBody(agent.view))
      .concat(this.bodyObstacles)
  }

  // Sends waiting agents to a free lounge seat, sitters to a seat the map moved, and sitters
  // whose seat is gone back to their desks.
  private seatLounges(): void {
    reconcileLeisure({
      agents: this.agents,
      sessions: [...this.sessions.values()],
      sources: this.sources,
      connected: this.ready,
      nowMs: this.nowMs,
      hasTrips: this.hasLoungeTrips,
      map: this.map,
      routes: this.routes,
      lounges: this.lounges,
      clearPassage: (key) => this.passages.clear(key),
      callHome: (agent, floor, desk) => this.callHome(agent, floor, desk)
    })
  }

  // Takes effect at the next step: agents in the lounge walk back, or waiting ones set out.
  setLoungeTrips(hasLoungeTrips: boolean): void {
    this.hasLoungeTrips = hasLoungeTrips
  }

  setBodyObstacles(bodies: readonly BodyFootprint[]): void {
    this.bodyObstacles = bodies.map((body) => ({ ...body }))
  }

  private moveAgent(agent: AgentRecord): AgentRecord {
    agent = resumeUnseatedWorker(agent, this.routes)
    if (agent.path.length === 0) return tickAgent(agent, TICK_MS)
    const obstacles = this.bodies()
    const walkers = [...this.agents.values()].flatMap((walker) => {
      const to = walker.path.find(
        (point) => Math.hypot(point.x - walker.view.x, point.z - walker.view.z) > 1e-8
      )
      return to ? [{ body: agentBody(walker.view), to }] : []
    })
    let hasYielded = false
    const next = tickAgent(agent, TICK_MS, (from, to) => {
      const navigation = workerNavigation({ routes: this.routes, from, to })
      const { isOpen } = navigation
      const body = agentBody(from)
      const hasClosedStart = !isOpen(from)
      const leader = waitsForMovingBody({ body, to, obstacles, walkers, isOpen })
      if (leader && !this.waitEdges.has(from.agentKey)) {
        this.waitEdges.set(from.agentKey, leader)
        const step = bodyStep({ body, to, obstacles, isOpen })
        if (Math.hypot(step.x - from.x, step.z - from.z) > 1e-6) this.steppable.add(from.agentKey)
      }
      if (leader && !this.cycleLeaders.has(from.agentKey)) {
        hasYielded = true
        return { ...to, x: from.x, z: from.z }
      }
      const moved = bodyStep({
        body,
        to: this.passages.guide({
          body,
          to,
          obstacles,
          walkers,
          tick: this.movementTick,
          isOpen,
          routeTo: (target) => navigation.around(body, target, obstacles)
        }),
        obstacles,
        // A layout may build a wall under a walker or shrink away; let that walker escape it.
        isOpen: (point) =>
          isOpen(point) ||
          (hasClosedStart && Math.hypot(point.x - from.x, point.z - from.z) <= 0.140001)
      })
      hasYielded ||= Math.hypot(moved.x - to.x, moved.z - to.z) > 1e-8
      return { ...to, ...moved }
    })
    const key = agent.view.agentKey
    const recovery = this.recovery.record({
      id: key,
      position: next.view,
      waypoint: next.path[0],
      hasYielded
    })
    // Brief direct steps can still circle a wall corner; recover from lack of waypoint progress.
    if (next.path.length && recovery.canRepath) {
      const route = recoverWorkerRoute({
        agent: next,
        routes: this.routes,
        obstacles,
        body: agentBody(next.view)
      })
      if (route.length) {
        next.path = route
        if (recovery.isStalled) this.passages.clear(key)
      }
      this.recovery.retried(key)
    }
    return next
  }

  // Work calls it home: it walks when its desk is on its floor, else fades to reappear there.
  private callHome(agent: AgentRecord, floor: FloorLayout, desk: Placement['slot']): AgentRecord {
    if (this.fading.has(agent.view.agentKey)) return agent
    const route = this.routes.toFloor(agent.view, floor, desk)
    if (!route.length) this.startFade(agent.view.agentKey)
    return returnToDesk(agent, desk.heading, route)
  }

  private startFade(key: string): void {
    this.fading.set(key, 0)
    this.passages.clear(key)
    this.recovery.clear(key)
  }

  private fadeOut(key: string, agent: AgentRecord): void {
    this.agents.set(key, agent)
    this.startFade(key)
  }

  // A desk another body stands on keeps it faded until the next tick.
  private seatRecalled(key: string, agent: AgentRecord): void {
    const seated = seatAtDesk(agent, this.map.floors, this.bodies())
    if (!seated) return
    this.agents.set(key, seated)
    this.fading.delete(key)
  }

  private remove(key: string): void {
    this.agents.delete(key)
    this.recovery.clear(key)
    this.passages.clear(key)
    this.fading.delete(key)
    this.members.delete(key)
  }

  step(dtMs: number): AgentView[] {
    this.syncClock()
    this.accumulatedMs += Number.isFinite(dtMs) ? clamp(dtMs, [0, 1000]) : 0
    while (this.accumulatedMs >= TICK_MS) {
      if (!this.options.now) this.nowMs += TICK_MS
      const steppable = this.steppable
      this.cycleLeaders = waitCycleLeaders(this.waitEdges, (id) => steppable.has(id))
      this.waitEdges = new Map()
      this.steppable = new Set()
      const ordered = [...this.agents].sort(([first], [second]) => first.localeCompare(second))
      const offset = this.movementTick++ % Math.max(1, ordered.length)
      for (const [key, agent] of [...ordered.slice(offset), ...ordered.slice(0, offset)]) {
        const fadedMs = this.fading.get(key)
        if (fadedMs === undefined) this.agents.set(key, this.moveAgent(agent))
        else if (fadedMs + TICK_MS < DEPARTURE_FADE_MS) this.fading.set(key, fadedMs + TICK_MS)
        else if (agent.state === 'leaving') this.remove(key)
        else this.seatRecalled(key, agent)
      }
      this.seatLounges()
      this.accumulatedMs -= TICK_MS
    }
    return [...this.agents.values()]
      .sort((a, b) => a.view.agentKey.localeCompare(b.view.agentKey))
      .map((a) => {
        const view: AgentView =
          a.state === 'leaving' ? { ...a.view, place: 'leaving' } : { ...a.view }
        const fadedMs = this.fading.get(a.view.agentKey)
        if (fadedMs !== undefined) view.fade = fadedMs / DEPARTURE_FADE_MS
        return view
      })
  }

  revision(): number {
    return this.helloRevision
  }

  layout(): LayoutMap {
    return structuredClone(this.map)
  }
}
