import {
  BODY_CLEARANCE_EPSILON,
  bodySegmentDistance,
  canSweepBody,
  isFiniteBody,
  bodiesShareElevation
} from './body-sweep'

// dry-new: route grids avoid walls, but workers, citizens and the player need swept body clearance.
export interface BodyFootprint {
  readonly id: string
  readonly x: number
  readonly z: number
  readonly radius: number
  readonly elevation?: number
  readonly connectorId?: string
}

export type BodyPoint = Pick<BodyFootprint, 'x' | 'z'>
export interface BodyPlacementOptions {
  readonly body: BodyFootprint
  readonly obstacles: readonly BodyFootprint[]
  readonly isOpen: (point: BodyPoint) => boolean
}
export interface BodyStepOptions extends BodyPlacementOptions {
  readonly to: BodyPoint
}

export const WORKER_BODY_RADIUS = 0.65
export const SUBAGENT_BODY_RADIUS = 0.55
export const CITIZEN_BODY_RADIUS = 0.55
export const PLAYER_BODY_RADIUS = 0.55
const MAX_BODY_STEP_METRES = 0.35
const PLACEMENT_RING_METRES = 0.25
const MAX_PLACEMENT_RADIUS_METRES = 24
const PLACEMENT_CLEARANCE_METRES = 0.02
const PASSING_ANGLES = [
  Math.PI / 6,
  -Math.PI / 6,
  Math.PI / 3,
  -Math.PI / 3,
  Math.PI / 2,
  -Math.PI / 2
]

export function bodyFits(body: BodyFootprint, obstacles: readonly BodyFootprint[]): boolean {
  return (
    isFiniteBody(body) &&
    obstacles.every((obstacle) => {
      if (obstacle.id === body.id) return true
      if (body.connectorId && obstacle.connectorId === body.connectorId) return false
      if (isFiniteBody(obstacle) && !bodiesShareElevation(body, obstacle)) return true
      return (
        isFiniteBody(obstacle) &&
        Math.hypot(body.x - obstacle.x, body.z - obstacle.z) + BODY_CLEARANCE_EPSILON >=
          body.radius + obstacle.radius
      )
    })
  )
}

function identityAngle(id: string): number {
  let hash = 0
  for (const character of id) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0
  return ((hash % 360) * Math.PI) / 180
}

export function bodyStep(options: BodyStepOptions): BodyPoint {
  const { body, to } = options
  const distance = Math.hypot(to.x - body.x, to.z - body.z)
  if (!isFiniteBody(body) || !Number.isFinite(distance) || distance <= BODY_CLEARANCE_EPSILON) {
    return { x: body.x, z: body.z }
  }
  const budget = Math.min(distance, MAX_BODY_STEP_METRES)
  const centered = options.obstacles.find(
    (obstacle) =>
      obstacle.id !== body.id &&
      bodiesShareElevation(body, obstacle) &&
      Math.hypot(body.x - obstacle.x, body.z - obstacle.z) <= BODY_CLEARANCE_EPSILON
  )
  const direction = centered
    ? identityAngle([body.id, centered.id].sort().join(':')) + (body.id < centered.id ? 0 : Math.PI)
    : Math.atan2(to.z - body.z, to.x - body.x)
  const direct =
    !centered && distance <= budget
      ? { x: to.x, z: to.z }
      : { x: body.x + Math.cos(direction) * budget, z: body.z + Math.sin(direction) * budget }
  if (canSweepBody({ ...options, to: direct })) return direct
  const blocker = options.obstacles
    .filter(
      (obstacle) =>
        obstacle.id !== body.id &&
        bodiesShareElevation(body, obstacle) &&
        bodySegmentDistance({ from: body, to: direct, obstacle }) < body.radius + obstacle.radius
    )
    .sort(
      (first, second) =>
        Math.hypot(body.x - first.x, body.z - first.z) -
          Math.hypot(body.x - second.x, body.z - second.z) || first.id.localeCompare(second.id)
    )[0]
  const tangent = blocker
    ? Math.atan2(body.z - blocker.z, body.x - blocker.x) - Math.PI / 2
    : direction + Math.PI / 2
  // Clockwise tangents keep passing around a body even when the next grid waypoint is behind it.
  const angles = [tangent, tangent + Math.PI, ...PASSING_ANGLES.map((turn) => direction + turn)]
  for (const angle of angles) {
    const candidate = { x: body.x + Math.cos(angle) * budget, z: body.z + Math.sin(angle) * budget }
    const step = { ...options, to: candidate }
    if (canSweepBody(step)) return candidate
  }
  return { x: body.x, z: body.z }
}

export function placeBody(options: BodyPlacementOptions): BodyPoint | null {
  const { body, obstacles, isOpen } = options
  if (!isFiniteBody(body)) return null
  if (isOpen(body) && bodyFits(body, obstacles)) return { x: body.x, z: body.z }
  const clearanceBody = { ...body, radius: body.radius + PLACEMENT_CLEARANCE_METRES }
  const startAngle = identityAngle(body.id)
  for (
    let radius = PLACEMENT_RING_METRES;
    radius <= MAX_PLACEMENT_RADIUS_METRES;
    radius += PLACEMENT_RING_METRES
  ) {
    const samples = Math.ceil((2 * Math.PI * radius) / PLACEMENT_RING_METRES)
    for (let index = 0; index < samples; index++) {
      const angle = startAngle + (index * 2 * Math.PI) / samples
      const candidate = {
        x: body.x + Math.cos(angle) * radius,
        z: body.z + Math.sin(angle) * radius
      }
      if (isOpen(candidate) && bodyFits({ ...clearanceBody, ...candidate }, obstacles))
        return candidate
    }
  }
  return null
}
