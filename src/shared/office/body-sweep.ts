import type { BodyFootprint, BodyPoint, BodyStepOptions } from './body-footprints'

export const BODY_CLEARANCE_EPSILON = 1e-8
const GROUND_SAMPLE_METRES = 0.0625
const BODY_HEIGHT_METRES = 2

export function bodiesShareElevation(first: BodyFootprint, second: BodyFootprint): boolean {
  if (first.connectorId && second.connectorId === first.connectorId) return true
  return Math.abs((first.elevation ?? 0) - (second.elevation ?? 0)) < BODY_HEIGHT_METRES
}

export function isFiniteBody(body: BodyFootprint): boolean {
  return (
    Number.isFinite(body.x) &&
    Number.isFinite(body.z) &&
    Number.isFinite(body.radius) &&
    Number.isFinite(body.elevation ?? 0) &&
    body.radius >= 0
  )
}

export function bodySegmentDistance(options: {
  from: BodyPoint
  to: BodyPoint
  obstacle: BodyPoint
}): number {
  const { from, to, obstacle } = options
  const dx = to.x - from.x
  const dz = to.z - from.z
  const squaredLength = dx * dx + dz * dz
  const projection = squaredLength
    ? Math.max(
        0,
        Math.min(1, ((obstacle.x - from.x) * dx + (obstacle.z - from.z) * dz) / squaredLength)
      )
    : 0
  return Math.hypot(from.x + dx * projection - obstacle.x, from.z + dz * projection - obstacle.z)
}

function clearsBodies(options: BodyStepOptions): boolean {
  return options.obstacles.every((obstacle) => {
    if (obstacle.id === options.body.id) return true
    if (!isFiniteBody(obstacle)) return false
    if (options.body.connectorId && obstacle.connectorId === options.body.connectorId) return false
    if (!bodiesShareElevation(options.body, obstacle)) return true
    const startDistance = Math.hypot(options.body.x - obstacle.x, options.body.z - obstacle.z)
    const clearance = options.body.radius + obstacle.radius
    const sweptDistance = bodySegmentDistance({ from: options.body, to: options.to, obstacle })
    if (startDistance + BODY_CLEARANCE_EPSILON >= clearance) {
      return sweptDistance + BODY_CLEARANCE_EPSILON >= clearance
    }
    // Existing overlaps may only escape monotonically, never jump through another body.
    const endDistance = Math.hypot(options.to.x - obstacle.x, options.to.z - obstacle.z)
    return (
      sweptDistance + BODY_CLEARANCE_EPSILON >= startDistance &&
      endDistance > startDistance + BODY_CLEARANCE_EPSILON
    )
  })
}

function clearsGround(options: BodyStepOptions): boolean {
  const distance = Math.hypot(options.to.x - options.body.x, options.to.z - options.body.z)
  const samples = Math.max(1, Math.ceil(distance / GROUND_SAMPLE_METRES))
  for (let index = 1; index <= samples; index++) {
    const fraction = index / samples
    const point = {
      x: options.body.x + (options.to.x - options.body.x) * fraction,
      z: options.body.z + (options.to.z - options.body.z) * fraction
    }
    if (!options.isOpen(point)) return false
  }
  return true
}

export function canSweepBody(options: BodyStepOptions): boolean {
  return (
    isFiniteBody(options.body) &&
    Number.isFinite(options.to.x) &&
    Number.isFinite(options.to.z) &&
    clearsBodies(options) &&
    clearsGround(options)
  )
}
