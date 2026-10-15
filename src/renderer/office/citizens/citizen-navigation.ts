import type { BodyPlacementOptions, BodyPoint } from '../../../shared/office/body-footprints'
import {
  bodiesShareElevation,
  bodySegmentDistance,
  canSweepBody
} from '../../../shared/office/body-sweep'
import { walkPath, type WalkGround } from '../player/walk-ground'

// dry-new: bodyStep's stateless tangents cannot retain a citizen's speed-limited passing route.
export interface CitizenNavigation {
  untilSec: number
  target: BodyPoint
  points: readonly BodyPoint[]
  blockedSec: number
}

const PASS_CLEARANCE_M = 0.15
const REPLAN_SEC = 0.75
export const CITIZEN_POSITION_EPSILON = 1e-8

interface NavigationStep extends BodyPlacementOptions {
  navigation: CitizenNavigation
  budget: number
  deltaSec: number
  ground?: WalkGround
}

function boundedPoint(from: BodyPoint, to: BodyPoint, budget: number): BodyPoint {
  const distance = Math.hypot(to.x - from.x, to.z - from.z)
  const share = distance > 0 ? Math.min(1, budget / distance) : 0
  return { x: from.x + (to.x - from.x) * share, z: from.z + (to.z - from.z) * share }
}

function passingPoints(options: NavigationStep, waypoint: BodyPoint): BodyPoint[] {
  const { body, obstacles, isOpen, budget } = options
  const step = boundedPoint(body, waypoint, budget)
  const blocker = obstacles
    .filter(
      (obstacle) =>
        obstacle.id !== body.id &&
        bodiesShareElevation(body, obstacle) &&
        bodySegmentDistance({ from: body, to: step, obstacle }) < body.radius + obstacle.radius
    )
    .sort(
      (first, second) =>
        Math.hypot(body.x - first.x, body.z - first.z) -
          Math.hypot(body.x - second.x, body.z - second.z) || first.id.localeCompare(second.id)
    )[0]
  if (!blocker) return []
  const clearance = body.radius + blocker.radius + PASS_CLEARANCE_M
  if (Math.hypot(waypoint.x - blocker.x, waypoint.z - blocker.z) <= clearance) return []
  const distance = Math.hypot(waypoint.x - body.x, waypoint.z - body.z)
  const forward = { x: (waypoint.x - body.x) / distance, z: (waypoint.z - body.z) / distance }
  const right = { x: forward.z, z: -forward.x }
  const ahead = (blocker.x - body.x) * forward.x + (blocker.z - body.z) * forward.z
  const lateral = (blocker.x - body.x) * right.x + (blocker.z - body.z) * right.z
  // Both walkers prefer their own right; they choose a side once, not a tangent every frame.
  for (const side of [1, -1]) {
    const approach = Math.max(0, ahead - clearance)
    const near = {
      x: body.x + forward.x * approach + right.x * (lateral + side * clearance),
      z: body.z + forward.z * approach + right.z * (lateral + side * clearance)
    }
    const far = {
      x: blocker.x + forward.x * clearance + right.x * side * clearance,
      z: blocker.z + forward.z * clearance + right.z * side * clearance
    }
    if (
      canSweepBody({ body, to: near, obstacles, isOpen }) &&
      canSweepBody({ body: { ...body, ...near }, to: far, obstacles, isOpen })
    )
      return [near, far, waypoint]
  }
  return []
}

function plannedPoints(options: NavigationStep, waypoint: BodyPoint): BodyPoint[] {
  if (!canSweepBody({ ...options, to: waypoint, obstacles: [] }) && options.ground)
    return walkPath(options.ground, options.body, waypoint).slice(1)
  return passingPoints(options, waypoint)
}

export function advanceNavigation(options: NavigationStep) {
  const { body, budget, deltaSec } = options
  let navigation = options.navigation
  let points = [...navigation.points]
  while (
    points.length > 0 &&
    Math.hypot(points[0].x - body.x, points[0].z - body.z) <= CITIZEN_POSITION_EPSILON
  )
    points.shift()
  let waypoint = points[0] ?? navigation.target
  let point = boundedPoint(body, waypoint, budget)
  if (!canSweepBody({ ...options, to: point })) {
    const blockedSec = navigation.blockedSec + deltaSec
    if (navigation.blockedSec === 0 || blockedSec >= REPLAN_SEC) {
      const planned = plannedPoints(options, waypoint)
      if (planned.length > 0) {
        points = [...planned, ...points.slice(1)]
        waypoint = points[0]
        point = boundedPoint(body, waypoint, budget)
      }
      navigation = { ...navigation, blockedSec: 0 }
    } else navigation = { ...navigation, blockedSec }
    if (!canSweepBody({ ...options, to: point }))
      return {
        point: { x: body.x, z: body.z },
        navigation: { ...navigation, points, blockedSec: navigation.blockedSec || deltaSec },
        distance: 0
      }
  }
  if (Math.hypot(point.x - waypoint.x, point.z - waypoint.z) <= CITIZEN_POSITION_EPSILON)
    points.shift()
  return {
    point,
    navigation: { ...navigation, points, blockedSec: 0 },
    distance: Math.hypot(point.x - body.x, point.z - body.z)
  }
}
