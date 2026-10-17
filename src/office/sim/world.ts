import {
  DEPARTURE_FADE_MS,
  type AgentView,
  type FeedMessage,
  type SessionRef,
  type SourceHealth
} from '../../shared/office/types'
import { clamp } from '../../shared/range'
import { BodyPassages } from '../../shared/office/body-passages'
import {
  bodyStep,
  bodyFits,
  placeBody,
  type BodyFootprint
} from '../../shared/office/body-footprints'
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
import type { PathCache } from './navigation'
import { MovementRecovery, remainingRouteMetres } from './movement-recovery'
import { placements, type Placement } from './placements'
import {
  FloorRoutes,
  floorElevation,
  floorEntrance,
  type FloorWaypoint
} from './world-floor-routes'
import { VenueBookings, type WorldVenue } from './world-venues'
import { homeRoute, reconcileLeisure } from './world-leisure'
import { isAwayForLeisure, seatAtDesk, walksHome } from './world-recall'
import { RoamOutings } from './roaming'
import type { Point } from './path'
import {
  recoverWorkerRoute,
  resumeUnseatedWorker,
  relayoutWorker,
  waitCycleLeaders,
  waitsForMovingBody,
  workerNavigation
} from './worker-navigation'
export type { WorldVenue } from './world-venues'

const TICK_MS = 100

export class World {
  private readonly routes = new FloorRoutes()
  private readonly venueBookings = new VenueBookings()
  private readonly roaming = new RoamOutings()
  private readonly connectorOccupants = new Map<string, string>()
  private baseline: LayoutMap = { version: 1, floors: [], reservations: {} }
  private sources: readonly SourceHealth[] = []
  private nowMs = 0
  private sessions = new Map<string, SessionRef>()
  private agents = new Map<string, AgentRecord>()
  private arrivals = new Map<string, AgentRecord>()
  private bodyObstacles: readonly BodyFootprint[] = []
  private departurePaths = new Map<string, PathCache>()
  private readonly recovery = new MovementRecovery()
  private readonly members = new Map<string, Placement['member']>()
  // Agents fading out in place, with how long each has faded. A leaver goes; any other was
  // called back to work and reappears at its desk (FOUND 7).
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
  // The floor `paths` and `lounges` were made for.
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
      getVenueTargets?: () => readonly WorldVenue[]
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
      [...this.arrivals, ...this.agents]
        .filter(([, agent]) => agent.state !== 'leaving')
        .map(([key, agent]) => [key, agent.view])
    )
    const desired = placements([...sessions.values()], map, held)
    this.sessions = sessions
    this.map = map
    this.baseline = baseline
    this.savedMap = undefined
    // Routes and lounges follow from the floor alone: while it stands as it was, the routes
    // already found are kept rather than searched for again.
    const previousPaths = new Map(
      oldMap.floors.map((floor) => [floor.id, this.routes.paths(floor.id)])
    )
    this.routes.update(
      this.map,
      [...this.agents.values()].flatMap((agent) =>
        agent.view.physicalFloorId ? [agent.view.physicalFloorId] : []
      )
    )
    const floorJson = JSON.stringify(this.map.floors)
    const isSameFloor = floorJson === this.floorJson
    if (!isSameFloor) {
      this.lounges = new Map(this.map.floors.flatMap((floor) => [...loungesByRoom(floor)]))
      this.floorJson = floorJson
    }
    const active = new Set(desired.map((p) => p.session.key))
    for (const key of this.arrivals.keys())
      if (!active.has(key)) {
        this.arrivals.delete(key)
        this.members.delete(key)
      }
    for (const [key, agent] of this.agents) {
      if (active.has(key) || agent.state === 'leaving') continue
      this.venueBookings.release(key)
      this.passages.clear(key)
      // A subagent runs inside its parent: it finishes at its desk while the parent works, and
      // leaves with the parent when the session ends (seating-4).
      const member = this.members.get(key)
      if (member?.kind === 'subagent' && active.has(member.leadKey)) {
        this.fadeOut(key, leaveAgent(agent, []))
        continue
      }
      const floor =
        this.routes.floor(agent.view.physicalFloorId) ??
        oldMap.floors.find((f) => f.id === agent.view.floorId)
      if (!floor) continue
      const oldPaths = previousPaths.get(floor.id) ?? this.routes.paths(floor.id)!
      const room = floor.rooms.find((r) => r.id === agent.view.roomId)
      const door = room?.slots.find((s) => s.id === 'door')
      // From the lounge it walks straight out: its office door is not on the way.
      const exit =
        agent.view.place === 'lounge'
          ? oldPaths.get(agent.view, floor.elevator)
          : door
            ? oldPaths.via(agent.view, door, floor.elevator)
            : oldPaths.get(agent.view, floor.elevator)
      const departure = this.options.resolveLayout
        ? this.routes.toGround(agent.view, floor, agent.view.place === 'lounge' ? undefined : door)
        : exit
      this.agents.set(key, leaveAgent(agent, departure))
      this.departurePaths.set(key, oldPaths)
    }
    const oldRooms = new Map(
      oldMap.floors.flatMap((floor) =>
        floor.rooms.map((room) => [`${floor.id}\n${room.id}`, room] as const)
      )
    )
    for (const placement of desired) {
      const { session, room, slot, floorId, isSubagent } = placement
      this.members.set(session.key, placement.member)
      const isFinished =
        placement.isFinished ||
        (session.observation?.coverage === 'own' &&
          (session.attention === 'none' || session.attention === 'done') &&
          (session.activity === 'idle' || session.attention === 'done'))
      const floor = this.map.floors.find((candidate) => candidate.id === floorId)!
      const paths = this.routes.paths(floorId)!
      const previousAgent = this.agents.get(session.key)
      const existing =
        previousAgent && this.options.resolveLayout
          ? relayoutWorker({
              agent: previousAgent,
              previousFloors: oldMap.floors,
              floors: map.floors
            })
          : previousAgent
      const waiting = this.arrivals.get(session.key)
      this.departurePaths.delete(session.key)
      if (existing && isAwayForLeisure(existing, isFinished, this.fading.has(session.key))) {
        const updated = setFinished(
          updateAgent(existing, session.activity, session.attention),
          isFinished
        )
        // The desk it will go back to is the one the map gives it now.
        Object.assign(updated.view, {
          floorId,
          roomId: room.id,
          slotId: slot.id,
          label: session.name
        })
        if (!isFinished) this.passages.clear(session.key)
        this.agents.set(session.key, isFinished ? updated : this.callHome(updated, floor, slot))
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
      const elevator = this.map.floors.find((f) => f.id === floorId)!.elevator
      const door = room.slots.find((s) => s.id === 'door')!
      const destination = {
        floorId,
        roomId: room.id,
        slotId: slot.id,
        x: slot.x,
        z: slot.z,
        heading: slot.heading,
        elevation: floorElevation(floor),
        physicalFloorId: floorId
      }
      // Initial source actors are seated; every later arrival or reassignment walks from its body.
      const route = existing ? this.routes.toFloor(existing.view, floor, slot) : []
      const groundStart = {
        ...destination,
        ...floorEntrance(floor),
        elevation: 0,
        physicalFloorId: null,
        agentKey: session.key,
        activity: session.activity,
        attention: session.attention,
        provider: session.provider,
        isSubagent,
        label: session.name
      }
      const entrance = isInitial
        ? []
        : this.options.resolveLayout
          ? this.routes.toFloor(groundStart, floor, slot, door)
          : paths.via(elevator, door, slot)
      const agent = createAgent(session, destination, route.length ? route : entrance)
      this.passages.clear(session.key)
      // A body re-routed where it stands stays as blocked as it was (seating-3).
      if (!existing) this.recovery.clear(session.key)
      this.fading.delete(session.key)
      agent.view.isSubagent = isSubagent
      if (existing)
        Object.assign(agent.view, {
          x: existing.view.x,
          z: existing.view.z,
          elevation: existing.view.elevation,
          physicalFloorId: existing.view.physicalFloorId
        })
      if (waiting) {
        const updated = updateAgent(waiting, session.activity, session.attention)
        agent.dwellMs = updated.dwellMs
        agent.queued = updated.queued
        agent.view.activity = updated.view.activity
      }
      // A desk that moved does not restart its wait for the lounge.
      agent.finishedForMs = existing?.finishedForMs ?? waiting?.finishedForMs ?? null
      if (!existing && !isInitial) {
        this.arrivals.set(session.key, setFinished(agent, isFinished))
      } else {
        this.arrivals.delete(session.key)
        this.agents.set(session.key, setFinished(agent, isFinished))
      }
    }
    this.activateArrivals()
  }

  private bodies(): BodyFootprint[] {
    return [...this.agents.values()]
      .map((agent) => agentBody(agent.view))
      .concat(this.bodyObstacles)
  }

  private activateArrivals(): void {
    if (!this.arrivals.size) return
    const obstacles = this.bodies()
    const arrivalDistance = (agent: AgentRecord): number => {
      const floor = this.map.floors.find((candidate) => candidate.id === agent.view.floorId)
      const destination = agent.path.at(-1)
      if (!floor || !destination) return 0
      const portal = this.options.resolveLayout ? floorEntrance(floor) : floor.elevator
      return Math.hypot(destination.x - portal.x, destination.z - portal.z)
    }
    // Fill deeper seats first so a new front row does not fence in workers walking behind it.
    for (const [key, agent] of [...this.arrivals].sort(
      ([first, firstAgent], [second, secondAgent]) =>
        arrivalDistance(secondAgent) - arrivalDistance(firstAgent) || first.localeCompare(second)
    )) {
      const floor = this.map.floors.find((candidate) => candidate.id === agent.view.floorId)
      const paths = this.routes.paths(floor?.id)
      if (!floor || !paths) continue
      const portal = this.options.resolveLayout ? floorEntrance(floor) : floor.elevator
      // Admit the next body after its predecessor clears the door, not a whole converging roster.
      // A predecessor stuck there no longer holds the door for the crew behind it (seating-3).
      // A walker still on the sidewalks, out or on its way home, is not at the door yet.
      const hasEntryTraffic = [...this.agents.values()].some(
        (walker) =>
          walker.state === 'arriving' &&
          !walker.path[0]?.sidewalk &&
          !this.fading.has(walker.view.agentKey) &&
          walker.view.floorId === floor.id &&
          !this.recovery.isBodyBlocked(walker.view.agentKey) &&
          (walker.view.physicalFloorId === null ||
            Math.hypot(walker.view.x - portal.x, walker.view.z - portal.z) < 2)
      )
      if (hasEntryTraffic) continue
      const room = floor.rooms.find((candidate) => candidate.id === agent.view.roomId)
      const seat = room?.slots.find((slot) => slot.id === agent.view.slotId)
      const door = room?.slots.find((slot) => slot.id === 'door')
      if (!seat || !door) continue
      const entrancePoint = portal
      const entrance = this.options.resolveLayout
        ? agent.path
        : paths.via(floor.elevator, door, seat)
      if (!entrance.length) continue
      const body = {
        ...agentBody(agent.view),
        x: entrancePoint.x,
        z: entrancePoint.z,
        elevation: 0
      }
      const start = placeBody({
        body,
        obstacles,
        isOpen: (point) =>
          (this.options.resolveLayout
            ? Math.hypot(point.x - body.x, point.z - body.z) <= 24
            : paths.isOpen(point)) &&
          !floor.zones.some(
            (zone) =>
              Math.abs(point.x - zone.x) < zone.width / 2 &&
              Math.abs(point.z - zone.z) < zone.depth / 2
          )
      })
      // An entrance with no room keeps its real session queued, never stacked or seated by fiat.
      if (!start) continue
      const queue =
        start.x === body.x && start.z === body.z
          ? []
          : this.options.resolveLayout
            ? [start, entrancePoint].map((point) => ({
                ...point,
                elevation: 0,
                physicalFloorId: null
              }))
            : paths.get(start, floor.elevator)
      if ((start.x !== body.x || start.z !== body.z) && !queue.length) continue
      const view = {
        ...agent.view,
        ...start,
        elevation: 0,
        physicalFloorId: this.options.resolveLayout ? null : floor.id
      }
      this.agents.set(key, {
        ...agent,
        state: 'arriving',
        view,
        path: queue.length ? [...queue, ...entrance.slice(1)] : entrance
      })
      this.arrivals.delete(key)
      obstacles.push(agentBody(view))
    }
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
      venues: this.venueTargets(),
      bookings: this.venueBookings,
      map: this.map,
      routes: this.routes,
      lounges: this.lounges,
      roaming: this.roaming,
      clearPassage: (key) => this.passages.clear(key)
    })
  }

  private venueTargets(): readonly WorldVenue[] {
    return this.options.getVenueTargets?.() ?? []
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
    if (agent.path.length === 0) return tickAgent(agent, 100)
    const departure = this.departurePaths.get(agent.view.agentKey)
    const obstacles = this.bodies()
    const walkers = [...this.agents.values()].flatMap((walker) => {
      const to = walker.path.find(
        (point) => Math.hypot(point.x - walker.view.x, point.z - walker.view.z) > 1e-8
      )
      return to ? [{ body: agentBody(walker.view), to }] : []
    })
    let hasYielded = false
    const next = tickAgent(agent, 100, (from, to) => {
      if (to.connectorId && to.elevation !== from.elevation) {
        const occupant = this.connectorOccupants.get(to.connectorId)
        if (occupant && occupant !== from.agentKey)
          return {
            x: from.x,
            z: from.z,
            elevation: from.elevation,
            physicalFloorId: from.physicalFloorId
          }
        const candidate = {
          ...agentBody(from),
          x: to.x,
          z: to.z,
          elevation: to.elevation,
          connectorId: to.connectorId
        }
        if (!bodyFits(candidate, obstacles))
          return {
            x: from.x,
            z: from.z,
            elevation: from.elevation,
            physicalFloorId: from.physicalFloorId
          }
        this.connectorOccupants.set(to.connectorId, from.agentKey)
        return to
      }
      const navigation = workerNavigation({ routes: this.routes, from, to, departure })
      // A sidewalk leg never steps onto a carriageway, even to pass someone (P5).
      const isOpen = to.sidewalk
        ? (point: Point) => navigation.isOpen(point) && this.routes.isSidewalkOpen(point)
        : navigation.isOpen
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
        return {
          ...to,
          x: from.x,
          z: from.z,
          elevation: from.elevation,
          physicalFloorId: from.physicalFloorId
        }
      }
      const moved = bodyStep({
        body,
        to: this.passages.guide({
          isExiting: agent.state === 'leaving',
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
      return {
        ...to,
        ...moved,
        elevation: from.elevation,
        physicalFloorId:
          Math.hypot(moved.x - to.x, moved.z - to.z) <= 1e-8
            ? to.physicalFloorId
            : from.physicalFloorId
      }
    })
    const activeConnector = next.path[0]?.connectorId
    next.view.connectorId =
      next.view.physicalFloorId === null && (next.view.elevation ?? 0) !== 0
        ? activeConnector
        : undefined
    const key = agent.view.agentKey
    const recovery = this.recovery.record({
      id: key,
      position: next.view,
      waypoint: next.path[0],
      hasYielded,
      remaining: remainingRouteMetres(next.view, next.path)
    })
    // A leaver that cannot get through fades where it stands; an arriver keeps waiting, never
    // moved by fiat (seating-2, verifier E7).
    if (recovery.isBodyBlocked && next.state === 'leaving') {
      next.path = []
      this.startFade(key)
    }
    this.releaseConnectors(key, next.path)
    const target = next.path.at(-1)
    // Brief direct steps can still circle a wall corner; recover from lack of waypoint progress.
    // A sidewalk leg keeps its route: the street detour would cross a carriageway.
    if (target && recovery.canRepath && !next.path[0]?.sidewalk) {
      const route = recoverWorkerRoute({
        agent: next,
        routes: this.routes,
        paths: departure ?? this.routes.paths(next.view.physicalFloorId),
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

  // Work calls it home: it walks when that fits the call, else fades to reappear at its desk.
  private callHome(agent: AgentRecord, floor: FloorLayout, desk: Placement['slot']): AgentRecord {
    if (this.fading.has(agent.view.agentKey)) return agent
    const route = homeRoute(agent, floor, desk, this.routes, this.venueTargets())
    if (walksHome(agent, route)) return returnToDesk(agent, desk.heading, route)
    this.startFade(agent.view.agentKey)
    return returnToDesk(agent, desk.heading, [])
  }

  // Frees each lift the agent holds that its route no longer rides; a fade or removal frees all.
  private releaseConnectors(key: string, route: readonly FloorWaypoint[] = []): void {
    for (const [connector, occupant] of this.connectorOccupants)
      if (occupant === key && !route.some((point) => point.connectorId === connector))
        this.connectorOccupants.delete(connector)
  }

  private startFade(key: string): void {
    this.fading.set(key, 0)
    this.passages.clear(key)
    this.recovery.clear(key)
    this.releaseConnectors(key)
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
    this.departurePaths.delete(key)
    this.recovery.clear(key)
    this.passages.clear(key)
    this.fading.delete(key)
    this.members.delete(key)
    this.releaseConnectors(key)
  }

  step(dtMs: number): AgentView[] {
    this.syncClock()
    this.activateArrivals()
    this.accumulatedMs += Number.isFinite(dtMs) ? clamp(dtMs, [0, 1000]) : 0
    while (this.accumulatedMs >= 100) {
      if (!this.options.now) this.nowMs += 100
      const steppable = this.steppable
      this.cycleLeaders = waitCycleLeaders(this.waitEdges, (id) => steppable.has(id))
      this.waitEdges = new Map()
      this.steppable = new Set()
      const ordered = [...this.agents].sort(([first], [second]) => first.localeCompare(second))
      const offset = this.movementTick++ % Math.max(1, ordered.length)
      for (const [key, agent] of [...ordered.slice(offset), ...ordered.slice(0, offset)]) {
        const fadedMs = this.fading.get(key)
        if (fadedMs !== undefined) {
          if (fadedMs + TICK_MS < DEPARTURE_FADE_MS) this.fading.set(key, fadedMs + TICK_MS)
          else if (agent.state === 'leaving') this.remove(key)
          else this.seatRecalled(key, agent)
          continue
        }
        const next = this.moveAgent(agent)
        if (next.removed) this.remove(key)
        else this.agents.set(key, next)
      }
      for (const [key, agent] of this.arrivals)
        this.arrivals.set(
          key,
          tickAgent(agent, 100, (from) => from)
        )
      this.activateArrivals()
      this.seatLounges()
      this.accumulatedMs -= 100
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
