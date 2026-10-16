export interface RoutePoint {
  x: number
  z: number
}

interface RouteStop {
  // Metres along the route where the wait happens.
  at: number
  sec: number
  // Gone inside a building for the wait: not drawn, and in nobody's way.
  isIndoors: boolean
}

// Walked from the first point to the last and back again, for ever. A loop ends where it began
// and is walked round and round instead.
export interface CitizenRoute {
  points: RoutePoint[]
  // One way, in metres.
  length: number
  isLoop?: true
  // In the order they are met. Loops only.
  stops?: RouteStop[]
}

export interface CitizenPose extends RoutePoint {
  heading: number
  isIndoors: boolean
}

// dry-new: interpolated poses cannot tell collision-delayed walkers when a corner or wait begins.
export interface RoutePhase {
  target: CitizenPose
  untilSec: number
  isWaiting: boolean
}

const ROUTE_EPSILON = 1e-8

export function turnToward(from: number, to: number, share: number): number {
  const gap = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return from + gap * Math.min(1, share)
}

// Where `metres` along the points is; `isReturning` turns the walker to face the way back.
function poseAlong(route: CitizenRoute, metres: number, isReturning: boolean): CitizenPose {
  let left = metres
  for (let index = 1; index < route.points.length; index++) {
    const from = route.points[index - 1]
    const to = route.points[index]
    const span = Math.hypot(to.x - from.x, to.z - from.z)
    if (span === 0 || (left > span && index < route.points.length - 1)) {
      left -= span
      continue
    }
    const along = { x: (to.x - from.x) / span, z: (to.z - from.z) / span }
    return {
      x: from.x + along.x * left,
      z: from.z + along.z * left,
      heading: isReturning ? Math.atan2(-along.x, -along.z) : Math.atan2(along.x, along.z),
      isIndoors: false
    }
  }
  return { ...route.points[0], heading: 0, isIndoors: false }
}

// Where a walker is after `travelled` metres' worth of walking time. A wait at a stop uses up
// the metres it would have walked at `speed`, so one number says where it is and whether it waits.
export function routePose(route: CitizenRoute, travelled: number, speed = 1): CitizenPose {
  if (route.length <= 0) return { ...route.points[0], heading: 0, isIndoors: false }
  if (!route.isLoop) {
    const lap = travelled % (route.length * 2)
    const isReturning = lap > route.length
    return poseAlong(route, isReturning ? route.length * 2 - lap : lap, isReturning)
  }
  const { metres, stop } = loopPlace(route, travelled, speed)
  return stop ? { ...poseAlong(route, stop.at, false), ...stop } : poseAlong(route, metres, false)
}

// How far round a loop `travelled` is, its waits taken out, and the stop it waits at, if any.
function loopPlace(
  route: CitizenRoute,
  travelled: number,
  speed: number
): { metres: number; stop?: RouteStop } {
  const stops = route.stops ?? []
  const waited = stops.reduce((sum, stop) => sum + stop.sec * speed, 0)
  let metres = travelled % (route.length + waited)
  for (const stop of stops) {
    if (metres < stop.at) break
    const wait = stop.sec * speed
    if (metres < stop.at + wait) return { metres: stop.at, stop }
    metres -= wait
  }
  return { metres }
}

export const loopMetres = (route: CitizenRoute, travelled: number, speed: number): number =>
  loopPlace(route, travelled, speed).metres

function nextVertex(route: CitizenRoute, metres: number, isReturning: boolean): number {
  let at = 0
  let next = isReturning ? 0 : route.length
  for (let index = 1; index < route.points.length; index++) {
    const from = route.points[index - 1]
    const to = route.points[index]
    at += Math.hypot(to.x - from.x, to.z - from.z)
    if (isReturning && at < metres - ROUTE_EPSILON) next = at
    if (!isReturning && at > metres + ROUTE_EPSILON) return at
  }
  return next
}

// A physical walker must reach this boundary before its clock can enter the following phase.
export function routePhase(route: CitizenRoute, walked: number, speed: number): RoutePhase {
  if (route.length <= 0 || speed <= 0)
    return { target: routePose(route, 0), untilSec: Infinity, isWaiting: true }
  const stops = route.isLoop ? (route.stops ?? []) : []
  const duration = route.isLoop
    ? route.length / speed + stops.reduce((sum, stop) => sum + stop.sec, 0)
    : (route.length * 2) / speed
  // Division can put an exact lap boundary just inside the previous lap.
  const cycleStart = Math.floor((walked + ROUTE_EPSILON) / duration) * duration
  const elapsed = Math.max(0, walked - cycleStart)
  if (!route.isLoop) {
    const isReturning = elapsed + ROUTE_EPSILON >= route.length / speed
    const metres = isReturning ? route.length * 2 - elapsed * speed : elapsed * speed
    const at = nextVertex(route, metres, isReturning)
    return {
      target: poseAlong(route, at, isReturning),
      untilSec: cycleStart + (isReturning ? route.length * 2 - at : at) / speed,
      isWaiting: false
    }
  }
  let waited = 0
  let nextStop = route.length
  for (const stop of stops) {
    const starts = stop.at / speed + waited
    if (elapsed + ROUTE_EPSILON < starts) {
      nextStop = stop.at
      break
    }
    if (elapsed < starts + stop.sec - ROUTE_EPSILON)
      return {
        target: { ...poseAlong(route, stop.at, false), isIndoors: stop.isIndoors },
        untilSec: cycleStart + starts + stop.sec,
        isWaiting: true
      }
    waited += stop.sec
  }
  const metres = (elapsed - waited) * speed
  const at = Math.min(nextVertex(route, metres, false), nextStop)
  return {
    target: poseAlong(route, at, false),
    untilSec: cycleStart + at / speed + waited,
    isWaiting: false
  }
}
