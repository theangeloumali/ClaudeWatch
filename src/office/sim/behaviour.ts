import type {
  AgentActivity,
  AgentAttention,
  AgentView,
  SessionRef
} from '../../shared/office/types'
import type { Slot } from './layout'
import type { FloorWaypoint } from './world-floor-routes'

type AgentState = 'arriving' | 'working' | 'needs_you' | 'done' | 'leaving'
export interface AgentRecord {
  view: AgentView
  state: AgentState
  path: FloorWaypoint[]
  dwellMs: number
  queued: AgentActivity | null
  slotHeading: number
  // How long its work has been over; null while it works.
  finishedForMs: number | null
  loungeSeatId: string | null
}
type Destination = Pick<
  AgentView,
  'floorId' | 'roomId' | 'slotId' | 'x' | 'z' | 'heading' | 'elevation' | 'physicalFloorId'
>
const urgent = (attention: AgentAttention) =>
  ['permission', 'question', 'error', 'limited'].includes(attention)

// How long a finished agent stays at its desk before it walks to its company's lounge.
export const LOUNGE_DELAY_MS = 20_000
const WALK_METRES_PER_SECOND = 1.4

// Seated at its destination: a newcomer fades in there, and a mover is given its route after.
export function createAgent(
  session: SessionRef,
  destination: Destination,
  isSubagent: boolean
): AgentRecord {
  return {
    view: {
      ...destination,
      agentKey: session.key,
      activity: session.activity,
      attention: session.attention,
      provider: session.provider,
      isSubagent,
      label: session.name
    },
    state: 'arriving',
    path: [],
    dwellMs: 0,
    queued: null,
    slotHeading: destination.heading,
    finishedForMs: null,
    loungeSeatId: null
  }
}

export function setFinished(agent: AgentRecord, isFinished: boolean): AgentRecord {
  return { ...agent, finishedForMs: isFinished ? (agent.finishedForMs ?? 0) : null }
}

export function wantsLounge(agent: AgentRecord): boolean {
  return (
    agent.state !== 'leaving' &&
    agent.path.length === 0 &&
    agent.view.place === undefined &&
    agent.finishedForMs !== null &&
    agent.finishedForMs >= LOUNGE_DELAY_MS
  )
}

function walk(agent: AgentRecord, heading: number, path: FloorWaypoint[]): AgentRecord {
  return { ...agent, state: 'arriving', slotHeading: heading, path: path.map((p) => ({ ...p })) }
}

// The view's room and slot stay those of its desk: only `place` says it is away.
export function goToLounge(
  agent: AgentRecord,
  seat: Pick<Slot, 'id' | 'heading'>,
  path: FloorWaypoint[]
): AgentRecord {
  const walking = walk(agent, seat.heading, path)
  return { ...walking, view: { ...agent.view, place: 'lounge' }, loungeSeatId: seat.id }
}

function withoutPlace(agent: AgentRecord): AgentRecord {
  const { place: _place, ...view } = agent.view
  return { ...agent, view, loungeSeatId: null }
}

export function returnToDesk(
  agent: AgentRecord,
  heading: number,
  path: FloorWaypoint[]
): AgentRecord {
  return walk(withoutPlace(agent), heading, path)
}

export function updateAgent(
  agent: AgentRecord,
  activity: AgentActivity,
  attention: AgentAttention
): AgentRecord {
  const next = { ...agent, view: { ...agent.view, attention } }
  if (next.state === 'leaving') return next
  if (urgent(attention)) {
    next.state = next.path.length ? 'arriving' : 'needs_you'
    next.view.heading = next.slotHeading
    next.view.activity = activity
    next.queued = null
    next.dwellMs = 0
  } else {
    if (next.state === 'needs_you' || (next.state === 'done' && attention !== 'done')) {
      next.state = next.path.length ? 'arriving' : 'working'
      next.view.heading = next.slotHeading
    }
    if (attention === 'done' && agent.view.attention !== 'done') {
      next.state = next.path.length ? 'arriving' : 'done'
      next.dwellMs = 0
    }
    if (activity === next.view.activity) next.queued = null
    else if (next.dwellMs >= 1500) {
      next.view.activity = activity
      next.dwellMs = 0
      next.queued = null
    } else next.queued = activity
  }
  return next
}

// A leaver fades where it stands, so it has nowhere to walk.
export function leaveAgent(agent: AgentRecord): AgentRecord {
  return { ...withoutPlace(agent), state: 'leaving', path: [], finishedForMs: null }
}

export function tickAgent(
  agent: AgentRecord,
  dtMs: number,
  move?: (from: AgentView, to: FloorWaypoint) => FloorWaypoint
): AgentRecord {
  const next = {
    ...agent,
    view: { ...agent.view },
    path: agent.path.map((p) => ({ ...p })),
    dwellMs: agent.dwellMs + dtMs,
    finishedForMs: agent.finishedForMs === null ? null : agent.finishedForMs + dtMs
  }
  if (next.state === 'arriving') {
    let distance = (dtMs / 1000) * WALK_METRES_PER_SECOND
    while (next.path.length) {
      const target = next.path[0],
        dx = target.x - next.view.x,
        dz = target.z - next.view.z,
        dy = (target.elevation ?? next.view.elevation ?? 0) - (next.view.elevation ?? 0)
      const length = Math.hypot(dx, dz, dy)
      const proposed =
        length > distance
          ? {
              ...target,
              x: next.view.x + (dx / length) * distance,
              z: next.view.z + (dz / length) * distance,
              elevation: (next.view.elevation ?? 0) + (dy / length) * distance,
              physicalFloorId: dy !== 0 ? null : target.physicalFloorId
            }
          : target
      const accepted = move?.(next.view, proposed) ?? proposed
      if (Math.hypot(accepted.x - next.view.x, accepted.z - next.view.z) > 1e-8)
        next.view.heading = Math.atan2(accepted.x - next.view.x, accepted.z - next.view.z)
      next.view.x = accepted.x
      next.view.z = accepted.z
      if (accepted.elevation !== undefined) next.view.elevation = accepted.elevation
      if (accepted.physicalFloorId !== undefined)
        next.view.physicalFloorId = accepted.physicalFloorId
      // A yield keeps the waypoint and walking state, but activity and lounge timers still advance.
      if (
        Math.hypot(
          accepted.x - proposed.x,
          accepted.z - proposed.z,
          (accepted.elevation ?? next.view.elevation ?? 0) -
            (proposed.elevation ?? next.view.elevation ?? 0)
        ) > 1e-8
      )
        break
      if (length > distance) {
        break
      }
      next.view.x = target.x
      next.view.z = target.z
      if (target.elevation !== undefined) next.view.elevation = target.elevation
      if (target.physicalFloorId !== undefined) next.view.physicalFloorId = target.physicalFloorId
      distance -= length
      next.path.shift()
    }
    if (!next.path.length) {
      next.state = urgent(next.view.attention)
        ? 'needs_you'
        : next.view.attention === 'done'
          ? 'done'
          : 'working'
      next.view.heading = next.slotHeading
      if (next.state === 'done') next.dwellMs = 0
    }
  }
  if (next.dwellMs >= 1500 && next.queued !== null) {
    next.view.activity = next.queued
    next.queued = null
    next.dwellMs = 0
  }
  if (next.state === 'done' && next.dwellMs >= 1500) next.state = 'working'
  return next
}
