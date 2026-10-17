import type { BodyFootprint } from '../../shared/office/body-footprints'
import {
  BODY_CLEARANCE_EPSILON,
  bodiesShareElevation,
  canSweepBody
} from '../../shared/office/body-sweep'
import type { AgentView } from '../../shared/office/types'
import type { Point } from './path'
import type { AgentRecord } from './behaviour'
import type { FloorRoutes, FloorWaypoint } from './world-floor-routes'
import { floorElevation } from './world-floor-routes'
import type { FloorLayout } from './layout'
import { contains } from '../../shared/office/world-document-geometry'

// dry-new: a physical-floor cache alone cannot guide a body across the street/door seam.
export function workerNavigation(options: {
  routes: FloorRoutes
  from: AgentView
  to: FloorWaypoint
}) {
  const paths =
    options.routes.paths(options.from.physicalFloorId) ??
    options.routes.paths(options.to.physicalFloorId) ??
    options.routes.paths(options.from.floorId)
  const isOpen = (point: Point): boolean =>
    paths?.contains(point)
      ? paths.isOpen(point)
      : (options.from.elevation ?? 0) === 0 && options.routes.isStreetOpen(point)
  return {
    paths,
    isOpen,
    around: (body: BodyFootprint, target: Point, obstacles: readonly BodyFootprint[]): Point[] =>
      paths && paths.contains(body) && paths.contains(target)
        ? paths.around({ body, to: target, obstacles })
        : options.routes.aroundStreet(body, target, obstacles)
  }
}

// The id of the moving body this one queues behind, or null when it may step.
export function waitsForMovingBody(options: {
  body: BodyFootprint
  to: Point
  walkers: readonly { body: BodyFootprint; to: Point }[]
  obstacles: readonly BodyFootprint[]
  isOpen: (point: Point) => boolean
}): string | null {
  if (canSweepBody(options)) return null
  const dx = options.to.x - options.body.x
  const dz = options.to.z - options.body.z
  const motionLength = Math.hypot(dx, dz)
  if (motionLength <= BODY_CLEARANCE_EPSILON) return null
  const leader = options.walkers.find((walker) => {
    if (walker.body.id === options.body.id || !bodiesShareElevation(options.body, walker.body))
      return false
    const gapX = walker.body.x - options.body.x
    const gapZ = walker.body.z - options.body.z
    const distance = Math.hypot(gapX, gapZ)
    const clearance = options.body.radius + walker.body.radius
    if (distance > clearance + 0.2 || dx * gapX + dz * gapZ <= 0) return false
    const forwardX = walker.to.x - walker.body.x
    const forwardZ = walker.to.z - walker.body.z
    const otherMotionLength = Math.hypot(forwardX, forwardZ)
    // Crossing exit paths must reach the passage yield, not wait as a parallel queue.
    return (
      otherMotionLength > BODY_CLEARANCE_EPSILON &&
      (dx * forwardX + dz * forwardZ) / (motionLength * otherMotionLength) > 0.5
    )
  })
  return leader?.body.id ?? null
}

// The lowest id on each wait cycle that can step goes; queues, including one behind a cycle,
// keep waiting. A total id order would reorder legitimate queues (seating-1, verifier E1).
export function waitCycleLeaders(
  waits: ReadonlyMap<string, string>,
  canStep: (id: string) => boolean = () => true
): Set<string> {
  const leaders = new Set<string>()
  const settled = new Set<string>()
  for (const start of waits.keys()) {
    const trail: string[] = []
    const onTrail = new Set<string>()
    let at: string | undefined = start
    while (at !== undefined && !settled.has(at) && !onTrail.has(at)) {
      trail.push(at)
      onTrail.add(at)
      at = waits.get(at)
    }
    if (at !== undefined && onTrail.has(at)) {
      const [leader] = trail
        .slice(trail.indexOf(at))
        .filter(canStep)
        .sort((first, second) => first.localeCompare(second))
      if (leader !== undefined) leaders.add(leader)
    }
    for (const id of trail) settled.add(id)
  }
  return leaders
}

// Every route stays on the walker's floor, so a fresh one around the crowd to its target will do.
export function recoverWorkerRoute(options: {
  agent: AgentRecord
  routes: FloorRoutes
  obstacles: readonly BodyFootprint[]
  body: BodyFootprint
}): FloorWaypoint[] {
  const { agent, routes, body, obstacles } = options
  const paths = routes.paths(agent.view.physicalFloorId)
  const target = agent.path.at(-1)
  if (!target) return []
  const route = paths?.contains(body)
    ? paths.around({ body, to: target, obstacles })
    : routes.aroundStreet(body, target, obstacles)
  return route.map((point) => ({
    ...point,
    elevation: agent.view.elevation,
    physicalFloorId: agent.view.physicalFloorId
  }))
}

export function resumeUnseatedWorker(agent: AgentRecord, routes: FloorRoutes): AgentRecord {
  if (agent.path.length || agent.view.place || agent.state === 'leaving') return agent
  const floor = routes.floor(agent.view.floorId)
  const seat = floor?.rooms
    .find((room) => room.id === agent.view.roomId)
    ?.slots.find((slot) => slot.id === agent.view.slotId)
  if (
    !floor ||
    !seat ||
    (agent.view.physicalFloorId === floor.id &&
      Math.hypot(agent.view.x - seat.x, agent.view.z - seat.z) < 1e-6)
  )
    return agent
  return {
    ...agent,
    state: 'arriving',
    path: routes.toFloor(agent.view, floor, seat),
    slotHeading: seat.heading
  }
}

// An explicit geometry edit carries occupied rooms; ordinary worker trips still use routes.
export function relayoutWorker(options: {
  agent: AgentRecord
  previousFloors: readonly FloorLayout[]
  floors: readonly FloorLayout[]
}): AgentRecord {
  const { agent, previousFloors, floors } = options
  const previous = previousFloors.find((floor) => floor.id === agent.view.physicalFloorId)
  if (!previous || floorElevation(previous) !== (agent.view.elevation ?? 0)) return agent
  const point = { x: agent.view.x, z: agent.view.z, width: 0, depth: 0 }
  if (!contains(previous, { ...point, x: point.x - previous.x, z: point.z - previous.z }))
    return agent
  const oldRoom = previous.rooms.find((room) =>
    contains(room, {
      ...point,
      x: point.x - room.x,
      z: point.z - room.z
    })
  )
  const matchesRoom = (room: FloorLayout['rooms'][number]): boolean =>
    oldRoom !== undefined && room.id === oldRoom.id && room.sessionKey === oldRoom.sessionKey
  const destination =
    floors.find((floor) => floor.id === previous.id) ??
    (previous.buildingId && oldRoom
      ? floors.find(
          (floor) =>
            floor.buildingId === previous.buildingId &&
            floorElevation(floor) === floorElevation(previous) &&
            floor.rooms.some(matchesRoom)
        )
      : undefined)
  if (!destination) return agent
  // Moving between elevations or buildings is a trip, not a geometry translation.
  if (
    floorElevation(destination) !== floorElevation(previous) ||
    destination.buildingId !== previous.buildingId
  )
    return agent
  const nextRoom = oldRoom && destination.rooms.find(matchesRoom)
  // Its room left this floor: the agent goes to its new desk, not along with the floor.
  if (oldRoom && !nextRoom) return agent
  const offsetX = (nextRoom?.x ?? destination.x) - (oldRoom?.x ?? previous.x)
  const offsetZ = (nextRoom?.z ?? destination.z) - (oldRoom?.z ?? previous.z)
  const elevation = floorElevation(destination)
  if (
    !offsetX &&
    !offsetZ &&
    elevation === (agent.view.elevation ?? 0) &&
    destination.id === agent.view.physicalFloorId
  )
    return agent
  return {
    ...agent,
    path: [],
    view: {
      ...agent.view,
      x: agent.view.x + offsetX,
      z: agent.view.z + offsetZ,
      elevation,
      physicalFloorId: destination.id
    }
  }
}
