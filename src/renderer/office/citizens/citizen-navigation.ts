import type {
  BodyFootprint,
  BodyPlacementOptions,
  BodyPoint
} from '../../../shared/office/body-footprints'
import { canSweepBody } from '../../../shared/office/body-sweep'
import { walkPath, type WalkGround } from '../player/walk-ground'

// dry-new: bodyStep's stateless tangents cannot retain a citizen's speed-limited passing route.
export interface CitizenNavigation {
  untilSec: number
  target: BodyPoint
  points: readonly BodyPoint[]
  blockedSec: number
  // Seconds without a step, kept across replans: the jam breaker's clock (citizens-2).
  stuckSec: number
  // The body in the way of the last step not taken.
  blockerId?: string
  // A body this walker gives way through until they are apart, and one it already backed from.
  passingId?: string
  backedFromId?: string
}

const PASS_CLEARANCE_M = 0.15
const REPLAN_SEC = 0.75
export const CITIZEN_POSITION_EPSILON = 1e-8

interface NavigationStep extends BodyPlacementOptions {
  navigation: CitizenNavigation
  budget: number
  deltaSec: number
  ground?: WalkGround
  giveWay?: GiveWay
}

// How a stuck walker clears the way (citizens-2): back off along its own route to `to`, or
// walk through the body in its way.
export type GiveWay = { kind: 'back-off'; to: BodyPoint } | { kind: 'pass' }

function boundedPoint(from: BodyPoint, to: BodyPoint, budget: number): BodyPoint {
  const distance = Math.hypot(to.x - from.x, to.z - from.z)
  const share = distance > 0 ? Math.min(1, budget / distance) : 0
  return { x: from.x + (to.x - from.x) * share, z: from.z + (to.z - from.z) * share }
}

// The nearest body that stops a step to `to`, by the sweep's own rule: a body the step moves
// away from never counts, however close.
function blockerOf(options: BodyPlacementOptions, to: BodyPoint): BodyFootprint | undefined {
  const { body, obstacles } = options
  return obstacles
    .filter(
      (obstacle) =>
        obstacle.id !== body.id &&
        !canSweepBody({ body, to, obstacles: [obstacle], isOpen: () => true })
    )
    .sort(
      (first, second) =>
        Math.hypot(body.x - first.x, body.z - first.z) -
          Math.hypot(body.x - second.x, body.z - second.z) || first.id.localeCompare(second.id)
    )[0]
}

function passingPoints(options: NavigationStep, waypoint: BodyPoint): BodyPoint[] {
  const { body, obstacles, isOpen, budget } = options
  const blocker = blockerOf(options, boundedPoint(body, waypoint, budget))
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

// A body walked through stays ignored until the two are clear of each other.
function withPassingSettled(options: NavigationStep): CitizenNavigation {
  const { body, obstacles, navigation } = options
  const passed = obstacles.find((obstacle) => obstacle.id === navigation.passingId)
  const isApart =
    !passed ||
    Math.hypot(passed.x - body.x, passed.z - body.z) >=
      body.radius + passed.radius + PASS_CLEARANCE_M
  return isApart ? { ...navigation, passingId: undefined } : navigation
}

// Backs off once per blocker; with no room behind, or a second time, walks through it.
function givenWay(options: NavigationStep, blockerId: string, giveWay: GiveWay) {
  const { body, budget, navigation } = options
  const settled = { ...navigation, blockedSec: 0, stuckSec: 0, blockerId: undefined }
  const canBack =
    giveWay.kind === 'back-off' &&
    navigation.backedFromId !== blockerId &&
    Math.hypot(giveWay.to.x - body.x, giveWay.to.z - body.z) > CITIZEN_POSITION_EPSILON &&
    canSweepBody({ ...options, to: boundedPoint(body, giveWay.to, budget) })
  return canBack
    ? { ...settled, points: [giveWay.to], backedFromId: blockerId }
    : { ...settled, passingId: blockerId }
}

export function advanceNavigation(step: NavigationStep) {
  let navigation = withPassingSettled(step)
  if (step.giveWay && navigation.blockerId)
    navigation = givenWay({ ...step, navigation }, navigation.blockerId, step.giveWay)
  const { passingId } = navigation
  const obstacles = passingId
    ? step.obstacles.filter((obstacle) => obstacle.id !== passingId)
    : step.obstacles
  const options = { ...step, navigation, obstacles }
  const { body, budget, deltaSec } = options
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
        navigation: {
          ...navigation,
          points,
          blockedSec: navigation.blockedSec || deltaSec,
          stuckSec: navigation.stuckSec + deltaSec,
          blockerId: blockerOf(options, point)?.id
        },
        distance: 0
      }
  }
  if (Math.hypot(point.x - waypoint.x, point.z - waypoint.z) <= CITIZEN_POSITION_EPSILON)
    points.shift()
  return {
    point,
    navigation: { ...navigation, points, blockedSec: 0, stuckSec: 0, blockerId: undefined },
    distance: Math.hypot(point.x - body.x, point.z - body.z)
  }
}
