import { isAtRest } from '../../shared/office/attention'
import { DESK_REACH_METRES, WORKER_BODY_RADIUS } from '../../shared/office/body-footprints'
import { between, draw, hashOf, type Span } from '../../shared/office/seeded-draw'
import { goStroll, isUrgent, LOUNGE_DELAY_MS, type AgentRecord } from './behaviour'
import type { AgentView } from '../../shared/office/types'
import type { FloorLayout, RoomLayout } from './layout'
import { NAV_CELL_METRES, ROUTE_MARGIN_METRES } from './navigation'
import type { Point } from './path'
import type { FloorRoutes } from './world-floor-routes'

const WORKING_EVERY_MS: Span = { min: 45_000, max: 120_000 }
const RESTING_EVERY_MS: Span = { min: 15_000, max: 40_000 }
const DWELL_MS: Span = { min: 5_000, max: 12_000 }
const DOOR_CLEAR_METRES = 2
// A body and its chair clear of every seat and of the desk drawn a desk reach either way of it.
const SEAT_CLEAR_METRES = 1
const SEAT_REACHES = [0, DESK_REACH_METRES, -DESK_REACH_METRES]
const SPOT_STEP_METRES = 0.5
const WALL_INSET_METRES = WORKER_BODY_RADIUS + ROUTE_MARGIN_METRES + NAV_CELL_METRES
const SPOT_GAP_METRES = 2 * WORKER_BODY_RADIUS

// `atMs` is when the agent next sets out, or leaves its spot; unset until its wait starts.
export interface StrollClock {
  atMs: number | undefined
  trip: number
  // Called home and still walking there: away, and kept out of the door zone, until seated.
  isReturning: boolean
}

export interface StrollContext {
  agents: Map<string, AgentRecord>
  clocks: Map<string, StrollClock>
  nowMs: number
  hasTrips: boolean
  floors: readonly FloorLayout[]
  routes: FloorRoutes
  isFading: (key: string) => boolean
  clearPassage: (key: string) => void
  callHome: (agent: AgentRecord) => AgentRecord | undefined
}

const spotsByRoom = new WeakMap<RoomLayout, Point[]>()

// Free floor on a half-metre grid, off the walls, the seats and their desks, and the door zone.
function spotsIn(room: RoomLayout): Point[] {
  const cached = spotsByRoom.get(room)
  if (cached) return cached
  const seats = room.slots.filter((slot) => slot.id !== 'door')
  const isClear = (spot: Point) =>
    doorDistance(room, spot) >= DOOR_CLEAR_METRES &&
    seats.every((seat) =>
      SEAT_REACHES.every(
        (reach) =>
          Math.hypot(
            spot.x - (seat.x + Math.sin(seat.heading) * reach),
            spot.z - (seat.z + Math.cos(seat.heading) * reach)
          ) >= SEAT_CLEAR_METRES
      )
    )
  const steps = (size: number) => Math.floor((size / 2 - WALL_INSET_METRES) / SPOT_STEP_METRES)
  const spots: Point[] = []
  for (let column = -steps(room.width); column <= steps(room.width); column++)
    for (let row = -steps(room.depth); row <= steps(room.depth); row++) {
      const spot = { x: room.x + column * SPOT_STEP_METRES, z: room.z + row * SPOT_STEP_METRES }
      if (isClear(spot)) spots.push(spot)
    }
  spotsByRoom.set(room, spots)
  return spots
}

const isInside = (room: RoomLayout, point: Point) =>
  Math.abs(point.x - room.x) <= room.width / 2 && Math.abs(point.z - room.z) <= room.depth / 2
const doorDistance = (room: RoomLayout, point: Point) =>
  Math.hypot(point.x - room.door.x, point.z - room.door.z)

// Body avoidance can shove a stroller off its route, so each step keeps out of the door zone;
// one that set out inside it may only move away from the door.
export function keepsClearOfDoor(
  from: AgentView,
  walk: { isReturning: boolean; destination: Point | undefined },
  floors: readonly FloorLayout[]
): (point: Point) => boolean {
  if (from.place !== 'stroll' && !walk.isReturning) return () => true
  const room = floors
    .find((floor) => floor.id === from.floorId)
    ?.rooms.find((candidate) => candidate.id === from.roomId)
  if (!room) return () => true
  // A desk inside the zone still lets its stroller walk home to it.
  const home = walk.destination ? doorDistance(room, walk.destination) : DOOR_CLEAR_METRES
  const nearest = Math.min(DOOR_CLEAR_METRES, doorDistance(room, from), home)
  return (point) => doorDistance(room, point) >= nearest - 1e-6
}

// The same agent and trip always draw the same share, so a replay strolls alike.
const shareOf = (agent: AgentRecord, salt: string, trip: number) =>
  draw(hashOf(`${salt}/${agent.view.agentKey}`), trip)

// At its own desk with nothing owed, and a finished agent only once the corner had its turn.
const canStroll = (agent: AgentRecord, isFading: boolean) =>
  !isFading &&
  agent.view.place === undefined &&
  agent.path.length === 0 &&
  agent.state !== 'leaving' &&
  agent.state !== 'arriving' &&
  !isUrgent(agent.view.attention) &&
  (agent.finishedForMs === null || agent.finishedForMs >= LOUNGE_DELAY_MS)

const sameRoom = (agent: AgentRecord, other: AgentRecord) =>
  other.view.floorId === agent.view.floorId &&
  other.view.roomId === agent.view.roomId &&
  other.state !== 'leaving'

// At most a third of a room away at once, the game corner's sitters and walkers home included.
function hasRoomToLeave(agent: AgentRecord, context: StrollContext): boolean {
  let members = 0
  let away = 0
  for (const other of context.agents.values()) {
    if (!sameRoom(agent, other)) continue
    members++
    const isReturning = context.clocks.get(other.view.agentKey)?.isReturning === true
    if (other.view.place === 'stroll' || other.view.place === 'lounge' || isReturning) away++
  }
  return away < Math.ceil(members / 3)
}

// A route that stays in the room and never nears the door more than the desk does.
function routeOut(agent: AgentRecord, trip: number, context: StrollContext) {
  const floor = context.floors.find((candidate) => candidate.id === agent.view.floorId)
  const room = floor?.rooms.find((candidate) => candidate.id === agent.view.roomId)
  if (!floor || !room) return undefined
  const taken = [...context.agents.values()]
    .filter((other) => other.view.place === 'stroll' && sameRoom(agent, other))
    .map((other) => other.path.at(-1) ?? other.view)
  const spots = spotsIn(room).filter((spot) =>
    taken.every((other) => Math.hypot(spot.x - other.x, spot.z - other.z) >= SPOT_GAP_METRES)
  )
  if (!spots.length) return undefined
  const spot = spots[Math.floor(shareOf(agent, 'spot', trip) * spots.length)]
  const path = context.routes.toFloor(agent.view, floor, spot)
  const nearest = Math.min(DOOR_CLEAR_METRES, doorDistance(room, agent.view))
  const isKept = path.every(
    (point) => isInside(room, point) && doorDistance(room, point) >= nearest - 1e-6
  )
  if (!path.length || !isKept) return undefined
  return { path, heading: Math.atan2(room.x - spot.x, room.z - spot.z) }
}

function goHome(agent: AgentRecord, clock: StrollClock | undefined, context: StrollContext) {
  if (clock) {
    clock.atMs = undefined
    clock.trip++
    clock.isReturning = true
  }
  context.agents.set(agent.view.agentKey, context.callHome(agent) ?? agent)
}

// Sets one due agent a call out to a free spot in its own room, and brings strollers back once
// their dwell is over, they are needed, they leave, or trips are switched off.
export function reconcileStrolls(context: StrollContext): void {
  const { agents, clocks, nowMs } = context
  let due: { agent: AgentRecord; clock: StrollClock } | undefined
  for (const agent of agents.values()) {
    const key = agent.view.agentKey
    const clock = clocks.get(key)
    if (clock?.isReturning && agent.path.length === 0) clock.isReturning = false
    if (agent.view.place === 'stroll') {
      const isCalled = !clock || !context.hasTrips || agent.state === 'leaving'
      if (isCalled || isUrgent(agent.view.attention)) goHome(agent, clock, context)
      else if (agent.path.length) continue
      else if (clock.atMs === undefined)
        clock.atMs = nowMs + between(DWELL_MS, shareOf(agent, 'dwell', clock.trip))
      else if (nowMs >= clock.atMs) goHome(agent, clock, context)
      continue
    }
    if (!context.hasTrips || !canStroll(agent, context.isFading(key))) {
      if (clock) clock.atMs = undefined
      continue
    }
    const ready = clock ?? { atMs: undefined, trip: 0, isReturning: false }
    clocks.set(key, ready)
    const every = isAtRest(agent.view) ? RESTING_EVERY_MS : WORKING_EVERY_MS
    if (ready.atMs === undefined)
      ready.atMs = nowMs + between(every, shareOf(agent, 'wait', ready.trip))
    else if (!due && nowMs >= ready.atMs) due = { agent, clock: ready }
  }
  if (!due) return
  const { agent, clock } = due
  const key = agent.view.agentKey
  if (!hasRoomToLeave(agent, context)) {
    clock.atMs = undefined
    return
  }
  const route = routeOut(agent, clock.trip, context)
  clock.atMs = undefined
  // A refused route moves on a trip, so the next try draws another spot.
  if (!route) {
    clock.trip++
    return
  }
  context.clearPassage(key)
  agents.set(key, goStroll(agent, route.heading, route.path))
}
