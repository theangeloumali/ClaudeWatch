import type { Point } from '../../../office/sim/path'
import type { FloorWaypoint } from '../../../office/sim/world-floor-routes'
import type { WalkGround } from './walk-ground'
import {
  bodyFits,
  bodyStep,
  PLAYER_BODY_RADIUS,
  type BodyFootprint
} from '../../../shared/office/body-footprints'

export const WALK_SPEED_M_PER_SEC = 4
// An agent this close can be spoken to.
const REACH_M = 2
// A slow machine keeps the pace up to this long a frame; a stall longer than it is not walked.
export const MAX_FRAME_SEC = 0.25
// Shorter than a cell of the walk ground, so no step can jump a wall.
const STEP_M = 0.1
const ARRIVED_M = 1e-6

// Screen directions: x to the right, y up the screen.
const KEY_DIRECTION: Record<string, readonly [number, number] | undefined> = {
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  w: [0, 1],
  s: [0, -1],
  a: [-1, 0],
  d: [1, 0]
}

// The name a walking key is held under, or null for any other key.
export function walkKey(key: string): string | null {
  const name = key.length === 1 ? key.toLowerCase() : key
  return KEY_DIRECTION[name] ? name : null
}

// The owner's character. Local to the page: nothing here is sent anywhere.
export interface Player {
  elevation?: number
  physicalFloorId?: string | null
  connectorId?: string
  position: Point
  // Yaw in radians, like an agent's: it faces (sin heading, cos heading).
  heading: number
  // Waypoints still to walk, nearest first.
  path: FloorWaypoint[]
  held: Set<string>
  // Where it was last sent; the scene turns this into a path on its next frame.
  goal: Point | null
  // Set by the scene while it is mounted, so a new goal draws a frame.
  onGoal: (() => void) | null
}

export function createPlayer(position: Point): Player {
  return {
    position: { ...position },
    heading: 0,
    path: [],
    held: new Set(),
    goal: null,
    onGoal: null
  }
}

export function sendPlayer(player: Player, to: Point): void {
  player.goal = { x: to.x, z: to.z }
  player.onGoal?.()
}

export function heldDirection(held: ReadonlySet<string>): { x: number; y: number } | null {
  let x = 0
  let y = 0
  for (const key of held) {
    const direction = KEY_DIRECTION[key]
    if (!direction) continue
    x += direction[0]
    y += direction[1]
  }
  x = Math.sign(x)
  y = Math.sign(y)
  return x === 0 && y === 0 ? null : { x, y }
}

// A unit step on the ground for a screen direction: "up" is away from the viewer at any rotation.
export function screenMove(direction: { x: number; y: number }, azimuth: number): Point {
  const sin = Math.sin(azimuth)
  const cos = Math.cos(azimuth)
  const length = Math.hypot(direction.x, direction.y) || 1
  return {
    x: (direction.x * cos - direction.y * sin) / length,
    z: (-direction.x * sin - direction.y * cos) / length
  }
}

// Walks `metres` along `direction`, an axis at a time: a wall stops the axis that meets it and
// leaves the other, so the player slides along it and never passes through.
export function stepWalk(
  from: Point,
  direction: Point,
  metres: number,
  isOpen: (point: Point) => boolean
): Point {
  const position = { ...from }
  for (let left = metres; left > ARRIVED_M; left -= STEP_M) {
    const step = Math.min(STEP_M, left)
    const alongX = { x: position.x + direction.x * step, z: position.z }
    if (direction.x !== 0 && isOpen(alongX)) position.x = alongX.x
    const alongZ = { x: position.x, z: position.z + direction.z * step }
    if (direction.z !== 0 && isOpen(alongZ)) position.z = alongZ.z
  }
  return position
}

function walkPathBy(
  player: Player,
  metres: number,
  ground: Pick<WalkGround, 'isOpen'>,
  obstacles: readonly BodyFootprint[]
): boolean {
  const before = player.position
  const beforeElevation = player.elevation
  let left = metres
  while (left > ARRIVED_M && player.path.length > 0) {
    const [next] = player.path
    const dx = next.x - player.position.x
    const dz = next.z - player.position.z
    const dy = (next.elevation ?? player.elevation ?? 0) - (player.elevation ?? 0)
    const distance = Math.hypot(dx, dz, dy)
    if (distance <= ARRIVED_M) {
      if (next.elevation !== undefined) player.elevation = next.elevation
      if (next.physicalFloorId !== undefined) player.physicalFloorId = next.physicalFloorId
      player.path.shift()
      continue
    }
    const budget = Math.min(left, distance, STEP_M)
    if (dy !== 0 && next.connectorId) {
      const fraction = budget / distance
      const candidate = {
        x: player.position.x + dx * fraction,
        z: player.position.z + dz * fraction,
        elevation: (player.elevation ?? 0) + dy * fraction
      }
      if (
        !bodyFits(
          {
            id: 'owner-player',
            ...candidate,
            connectorId: next.connectorId,
            radius: PLAYER_BODY_RADIUS
          },
          obstacles
        )
      )
        break
      player.position = { x: candidate.x, z: candidate.z }
      player.elevation = candidate.elevation
      player.physicalFloorId = null
      player.connectorId = next.connectorId
      left -= budget
      if (budget >= distance - ARRIVED_M) {
        player.elevation = next.elevation
        player.physicalFloorId = next.physicalFloorId
        player.connectorId = undefined
        player.path.shift()
      }
      continue
    }
    const position = bodyStep({
      body: {
        id: 'owner-player',
        ...player.position,
        elevation: player.elevation,
        radius: PLAYER_BODY_RADIUS
      },
      to: {
        x: player.position.x + (dx / distance) * budget,
        z: player.position.z + (dz / distance) * budget
      },
      obstacles,
      isOpen: ground.isOpen
    })
    const walked = Math.hypot(position.x - player.position.x, position.z - player.position.z)
    if (walked <= ARRIVED_M) break
    player.heading = Math.atan2(position.x - player.position.x, position.z - player.position.z)
    player.position = position
    left -= walked
    if (Math.hypot(next.x - position.x, next.z - position.z) <= ARRIVED_M) {
      player.position = { x: next.x, z: next.z }
      if (next.elevation !== undefined) player.elevation = next.elevation
      if (next.physicalFloorId !== undefined) player.physicalFloorId = next.physicalFloorId
      player.path.shift()
    }
  }
  return (
    before.x !== player.position.x ||
    before.z !== player.position.z ||
    beforeElevation !== player.elevation ||
    player.path.some((point) => point.connectorId)
  )
}

// One frame of walking. True when the player moved or turned, which is the only time the scene
// needs another frame: held against a wall, or standing, it asks for none.
export function tickPlayer(
  player: Player,
  ground: Pick<WalkGround, 'isOpen'>,
  deltaSec: number,
  azimuth: number,
  obstacles: readonly BodyFootprint[] = []
): boolean {
  const metres =
    WALK_SPEED_M_PER_SEC *
    (Number.isFinite(deltaSec) ? Math.max(0, Math.min(deltaSec, MAX_FRAME_SEC)) : 0)
  const direction = player.path.some((point) => point.connectorId)
    ? null
    : heldDirection(player.held)
  if (!direction) {
    if (player.path.length === 0) return false
    return walkPathBy(player, metres, ground, obstacles)
  }
  // The keys are the owner's hand on the player: they end a walk it was sent on.
  player.path = []
  const move = screenMove(direction, azimuth)
  const next = stepWalk(
    player.position,
    move,
    metres,
    (point) =>
      ground.isOpen(point) &&
      bodyFits(
        { id: 'owner-player', ...point, elevation: player.elevation, radius: PLAYER_BODY_RADIUS },
        obstacles
      )
  )
  const heading = Math.atan2(move.x, move.z)
  const hasChanged =
    next.x !== player.position.x || next.z !== player.position.z || heading !== player.heading
  player.position = next
  player.heading = heading
  return hasChanged
}

// The nearest agent close enough to speak to, if any.
export function agentInReach<Agent extends Point>(
  position: Point & { elevation?: number },
  agents: readonly Agent[]
): Agent | null {
  let nearest: Agent | null = null
  let nearestDistance = REACH_M
  for (const agent of agents) {
    const elevation =
      'elevation' in agent && typeof agent.elevation === 'number' ? agent.elevation : 0
    const distance = Math.hypot(
      agent.x - position.x,
      agent.z - position.z,
      elevation - (position.elevation ?? 0)
    )
    if (distance <= nearestDistance) {
      nearest = agent
      nearestDistance = distance
    }
  }
  return nearest
}
