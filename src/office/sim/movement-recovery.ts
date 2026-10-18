import type { Point } from './path'

const PROGRESS_METRES = 0.05
const REPATH_YIELD_TICKS = 10
// A passing detour lasts eight seconds; allow it to finish before treating a waypoint as stuck.
const STALLED_TICKS = 120
// Retries a stalled walker gets, a second apart, before it gives up on its route.
const STALLED_RETRIES = 2
// How much nearer its destination a walker must get for its retries to have worked.
const GROUND_METRES = 1

interface Progress {
  position: Point
  waypoint: Point
  destination: Point
  distance: number
  stalledTicks: number
  // Ticks turned aside since it last gained on its waypoint: free steps between do not count.
  yieldedTicks: number
  // Retries made while stalled since the walker last gained ground, and how far it then was.
  fruitlessRetries: number
  groundDistance: number
}

const gap = (from: Point, to: Point): number => Math.hypot(to.x - from.x, to.z - from.z)
const isSamePoint = (first: Point, second: Point): boolean =>
  first.x === second.x && first.z === second.z

// dry-new: body clearance is stateless; recovery also needs sustained progress toward a waypoint.
export class MovementRecovery {
  private readonly progress = new Map<string, Progress>()

  clear(id: string): void {
    this.progress.delete(id)
  }

  // Only walking toward a waypoint restarts the stall clock: a retry or a new route does not.
  record({
    id,
    position,
    path,
    hasYielded
  }: {
    id: string
    position: Point
    path: readonly Point[]
    hasYielded: boolean
  }): { canRepath: boolean; isStalled: boolean; isStuck: boolean } {
    const waypoint = path[0]
    const destination = path.at(-1)
    if (!waypoint || !destination) {
      this.clear(id)
      return { canRepath: false, isStalled: false, isStuck: false }
    }
    const previous = this.progress.get(id)
    const yieldedTicks = (previous?.yieldedTicks ?? 0) + (hasYielded ? 1 : 0)
    const distance = gap(position, waypoint)
    let progress = previous
    if (!progress || !isSamePoint(progress.destination, destination)) {
      progress = {
        position,
        waypoint: { ...waypoint },
        destination: { ...destination },
        distance,
        stalledTicks: 0,
        yieldedTicks,
        fruitlessRetries: 0,
        groundDistance: 0
      }
      this.progress.set(id, progress)
    } else {
      Object.assign(progress, { position, yieldedTicks })
      if (
        !isSamePoint(progress.waypoint, waypoint) ||
        distance < progress.distance - PROGRESS_METRES
      )
        Object.assign(progress, {
          waypoint: { ...waypoint },
          distance,
          stalledTicks: 0,
          yieldedTicks: 0
        })
      else progress.stalledTicks += 1
      if (gap(position, destination) <= progress.groundDistance - GROUND_METRES)
        progress.fruitlessRetries = 0
    }
    const stalledFor = progress.stalledTicks - STALLED_TICKS
    const isStalled = stalledFor >= 0
    return {
      canRepath:
        (isStalled && stalledFor % REPATH_YIELD_TICKS === 0) ||
        (hasYielded &&
          progress.yieldedTicks > 0 &&
          progress.yieldedTicks % REPATH_YIELD_TICKS === 0),
      isStalled,
      isStuck: isStalled && progress.fruitlessRetries >= STALLED_RETRIES
    }
  }

  // A stalled retry counts against the walker; a new route starts where it stands, so its
  // waypoint is the next point on, measured afresh.
  retried(id: string, path: readonly Point[]): void {
    const progress = this.progress.get(id)
    if (!progress) return
    if (progress.stalledTicks >= STALLED_TICKS) {
      if (!progress.fruitlessRetries)
        progress.groundDistance = gap(progress.position, progress.destination)
      progress.fruitlessRetries += 1
    }
    const waypoint = path.find((point) => gap(progress.position, point) > 1e-6)
    if (!waypoint || isSamePoint(waypoint, progress.waypoint)) return
    progress.waypoint = { ...waypoint }
    progress.distance = gap(progress.position, waypoint)
  }
}
