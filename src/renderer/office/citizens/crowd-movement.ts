import {
  placeBody,
  CITIZEN_BODY_RADIUS,
  type BodyFootprint
} from '../../../shared/office/body-footprints'
import type { SceneBodies } from '../scene/BodySpace'
import type { Trip } from '../town/town-trips'
import { nearestOpen, type WalkGround } from '../player/walk-ground'
import {
  advanceNavigation,
  CITIZEN_POSITION_EPSILON,
  type CitizenNavigation
} from './citizen-navigation'
import { routePhase, routePose, type CitizenPose } from './route-pose'

// dry-new: route interpolation has no retained obstacle waypoints; motion extends its existing pose.
export interface CitizenMotionPose extends CitizenPose {
  navigation?: CitizenNavigation
}

const MAX_STEP_SEC = 0.25
const CLOCK_BOUNDARY_MARGIN_SEC = 1e-6

export const citizenBodyId = (index: number): string => `citizen:${index}`
const bodyAt = (pose: CitizenPose, index: number): BodyFootprint => ({
  id: citizenBodyId(index),
  x: pose.x,
  z: pose.z,
  radius: CITIZEN_BODY_RADIUS
})

export function seedCrowd(
  trips: readonly Trip[],
  space: SceneBodies,
  isOpen: (point: { x: number; z: number }) => boolean,
  current?: readonly (CitizenMotionPose | undefined)[]
): CitizenMotionPose[] {
  const obstacles = [
    ...space.workers,
    ...space.external().filter((body) => !body.id.startsWith('citizen:')),
    ...(current?.flatMap((pose, index) =>
      pose && trips[index]?.kind === 'citizen' && !pose.isIndoors ? [bodyAt(pose, index)] : []
    ) ?? [])
  ]
  return trips.map((trip, index) => {
    const pose = current?.[index] ?? routePose(trip.route, trip.startSec * trip.speed, trip.speed)
    // Retained poses escape new overlaps by walking; snapshots must never relocate them.
    if (trip.kind !== 'citizen' || pose.isIndoors || current?.[index]) return pose
    const position = placeBody({ body: bodyAt(pose, index), obstacles, isOpen })
    if (!position) throw new Error('No clear citizen placement in the town')
    const placed = { ...pose, ...position }
    obstacles.push(bodyAt(placed, index))
    return placed
  })
}

interface CitizenStep {
  trip: Trip
  index: number
  pose: CitizenMotionPose
  walked: number
  deltaSec: number
  space: SceneBodies
  isOpen: (point: { x: number; z: number }) => boolean
  ground?: WalkGround
}

export function advanceCitizen(options: CitizenStep) {
  const { trip, index, space, isOpen, ground } = options
  let { pose, walked } = options
  let remainingSec = Math.max(0, Math.min(options.deltaSec, MAX_STEP_SEC))
  let distance = 0
  while (remainingSec > CITIZEN_POSITION_EPSILON) {
    const phase = routePhase(trip.route, walked, trip.speed)
    // A stale boundary must not trap the renderer in a zero-time animation loop.
    if (!(phase.untilSec > walked)) break
    if (phase.isWaiting) {
      const waited = Math.min(remainingSec, phase.untilSec - walked)
      walked += waited
      remainingSec -= waited
      pose = { ...pose, isIndoors: phase.target.isIndoors, navigation: undefined }
      continue
    }
    if (pose.isIndoors) {
      const point = placeBody({ body: bodyAt(pose, index), obstacles: space.all(), isOpen })
      if (!point) break
      pose = { ...pose, ...point, isIndoors: false, navigation: undefined }
    }
    let navigation: CitizenNavigation =
      pose.navigation?.untilSec === phase.untilSec
        ? pose.navigation
        : {
            untilSec: phase.untilSec,
            target: ground ? (nearestOpen(ground, phase.target) ?? phase.target) : phase.target,
            points: [],
            blockedSec: 0
          }
    if (ground && !ground.isOpen(navigation.target)) {
      const target = nearestOpen(ground, phase.target)
      if (target) navigation = { ...navigation, target, points: [], blockedSec: 0 }
    }
    const before = Math.hypot(pose.x - navigation.target.x, pose.z - navigation.target.z)
    const step = advanceNavigation({
      body: bodyAt(pose, index),
      navigation,
      obstacles: space.all(),
      isOpen,
      ground,
      budget: trip.speed * remainingSec,
      deltaSec: remainingSec
    })
    const after = Math.hypot(step.point.x - navigation.target.x, step.point.z - navigation.target.z)
    pose = { ...pose, ...step.point, navigation: step.navigation }
    distance += step.distance
    if (after <= CITIZEN_POSITION_EPSILON) {
      walked = phase.untilSec
      remainingSec -= step.distance / trip.speed
      pose = {
        ...pose,
        isIndoors: routePhase(trip.route, walked, trip.speed).target.isIndoors,
        navigation: undefined
      }
      continue
    }
    // Only forward physical progress advances the route; a detour cannot skip a wait or corner.
    walked = Math.max(
      walked,
      Math.min(
        phase.untilSec - CLOCK_BOUNDARY_MARGIN_SEC,
        walked + Math.max(0, before - after) / trip.speed
      )
    )
    if (step.distance > CITIZEN_POSITION_EPSILON && step.distance < trip.speed * remainingSec) {
      remainingSec -= step.distance / trip.speed
      continue
    }
    break
  }
  const displacement = Math.hypot(pose.x - options.pose.x, pose.z - options.pose.z)
  if (displacement > CITIZEN_POSITION_EPSILON)
    pose = {
      ...pose,
      heading: Math.atan2(pose.x - options.pose.x, pose.z - options.pose.z)
    }
  if (pose.isIndoors) space.remove(citizenBodyId(index))
  else space.set(bodyAt(pose, index))
  return { pose, walked, distance }
}
