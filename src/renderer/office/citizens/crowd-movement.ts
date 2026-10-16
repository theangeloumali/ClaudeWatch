import {
  placeBody,
  CITIZEN_BODY_RADIUS,
  type BodyFootprint,
  type BodyPoint
} from '../../../shared/office/body-footprints'
import type { SceneBodies } from '../scene/BodySpace'
import type { Trip } from '../town/town-trips'
import { nearestOpen, type WalkGround } from '../player/walk-ground'
import {
  advanceNavigation,
  CITIZEN_POSITION_EPSILON,
  type CitizenNavigation,
  type GiveWay
} from './citizen-navigation'
import { routePhase, routePose, type CitizenPose } from './route-pose'

// dry-new: route interpolation has no retained obstacle waypoints; motion extends its existing pose.
export interface CitizenMotionPose extends CitizenPose {
  navigation?: CitizenNavigation
}

const MAX_STEP_SEC = 0.25
const CLOCK_BOUNDARY_MARGIN_SEC = 1e-6
// How long a jam stands before one walker gives way, and how far back it steps: room for two
// citizen bodies to pass with the passing clearance (citizens-2).
const STUCK_YIELD_SEC = 1.5
const RETREAT_M = 1.25

// What a citizen waits for when no body is in its way: the end of a stop on its route, or
// traffic clearing its zebra.
const AT_STOP = '(at a stop)'
const AT_KERB = '(at the kerb)'
const CITIZEN_ID_PREFIX = 'citizen:'
export const citizenBodyId = (index: number): string => `${CITIZEN_ID_PREFIX}${index}`
const citizenIndexOf = (bodyId: string): number => Number(bodyId.slice(CITIZEN_ID_PREFIX.length))
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
  // The crowd's wait-for graph: a stuck citizen's body id to the body in its way. Given, jams
  // are broken; without it a blocked citizen waits for ever.
  waitsFor?: Map<string, string>
  // False for a step onto a zebra a vehicle is driving over: the walker waits at the kerb.
  canStepOnto?: (from: BodyPoint, to: BodyPoint) => boolean
}

// The citizens in a wait-for cycle through `bodyId`; none when its wait ends at someone free.
function jamThrough(waitsFor: ReadonlyMap<string, string>, bodyId: string): string[] {
  const members = [bodyId]
  for (
    let next = waitsFor.get(bodyId);
    next !== undefined && !members.includes(next);
    next = waitsFor.get(next)
  )
    members.push(next)
  return waitsFor.get(members[members.length - 1]) === bodyId ? members : []
}

// How citizen `index` breaks the wait it is stuck in, if it is the one to: behind a citizen
// standing at a stop on the walk it passes through; in a jam, the last citizen by index backs
// off. A queue behind anyone else stays put.
function giveWayOf(options: CitizenStep, walked: number): GiveWay | undefined {
  const { waitsFor, trip, index } = options
  const blockerId = waitsFor?.get(citizenBodyId(index))
  if (!waitsFor || blockerId === undefined) return undefined
  if (waitsFor.get(blockerId) === AT_STOP) return { kind: 'pass' }
  const jam = jamThrough(waitsFor, citizenBodyId(index))
  if (jam.length < 2 || jam.some((member) => citizenIndexOf(member) > index)) return undefined
  const behind = Math.max(0, walked * trip.speed - RETREAT_M)
  return { kind: 'back-off', to: routePose(trip.route, behind, trip.speed) }
}

export function advanceCitizen(options: CitizenStep) {
  const { trip, index, space, isOpen, ground, waitsFor } = options
  const bodyId = citizenBodyId(index)
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
      waitsFor?.set(bodyId, AT_STOP)
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
            blockedSec: 0,
            stuckSec: 0,
            // A give-way outlives the route corner it began on.
            passingId: pose.navigation?.passingId,
            backedFromId: pose.navigation?.backedFromId
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
      deltaSec: remainingSec,
      giveWay: navigation.stuckSec >= STUCK_YIELD_SEC ? giveWayOf(options, walked) : undefined
    })
    if (step.distance > 0 && options.canStepOnto?.(pose, step.point) === false) {
      waitsFor?.set(bodyId, AT_KERB)
      break
    }
    const blockerId = step.distance > 0 ? undefined : step.navigation.blockerId
    if (blockerId) waitsFor?.set(bodyId, blockerId)
    else waitsFor?.delete(bodyId)
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
  if (pose.isIndoors) {
    space.remove(bodyId)
    waitsFor?.delete(bodyId)
  } else space.set(bodyAt(pose, index))
  return { pose, walked, distance }
}
