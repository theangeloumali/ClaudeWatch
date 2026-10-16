import type { Point } from './path'

const PROGRESS_METRES = 0.05
const REPATH_YIELD_TICKS = 10
// A passing detour lasts eight seconds; allow it to finish before treating a waypoint as stuck.
const STALLED_TICKS = 120
// How long a walker may yield without gaining ground on its route before it counts as stuck.
export const BODY_BLOCKED_LIMIT_SEC = 15
const BODY_BLOCKED_TICKS = BODY_BLOCKED_LIMIT_SEC * 10
// Gridlocked bodies jitter by centimetres; only real headway restarts the count.
const BLOCKED_PROGRESS_METRES = 0.5

interface Progress {
  waypoint: Point
  distance: number
  stalledTicks: number
  yieldedTicks: number
}

// dry-new: no shared polyline length; recovery measures headway along the whole route.
export function remainingRouteMetres(position: Point, route: readonly Point[]): number {
  let metres = 0
  let from = position
  for (const point of route) {
    metres += Math.hypot(point.x - from.x, point.z - from.z)
    from = point
  }
  return metres
}

// dry-new: body clearance is stateless; recovery also needs sustained progress toward a waypoint.
export class MovementRecovery {
  private readonly progress = new Map<string, Progress>()
  // Kept apart from `progress`: a repath or a new waypoint must not restart it (seating-2).
  private readonly blocked = new Map<string, { remaining: number; ticks: number }>()

  clear(id: string): void {
    this.progress.delete(id)
    this.blocked.delete(id)
  }

  record({
    id,
    position,
    waypoint,
    hasYielded,
    remaining
  }: {
    id: string
    position: Point
    waypoint?: Point
    hasYielded: boolean
    // Route metres still to walk, measured from `position`.
    remaining: number
  }): { canRepath: boolean; isStalled: boolean; isBodyBlocked: boolean } {
    if (!waypoint) {
      this.clear(id)
      return { canRepath: false, isStalled: false, isBodyBlocked: false }
    }
    const blocked = this.blocked.get(id)
    if (!blocked) this.blocked.set(id, { remaining, ticks: hasYielded ? 1 : 0 })
    else if (remaining < blocked.remaining - BLOCKED_PROGRESS_METRES)
      this.blocked.set(id, { remaining, ticks: 0 })
    else if (hasYielded) blocked.ticks += 1
    const previous = this.progress.get(id)
    const yieldedTicks = hasYielded ? (previous?.yieldedTicks ?? 0) + 1 : 0
    const distance = Math.hypot(waypoint.x - position.x, waypoint.z - position.z)
    let progress = previous
    if (!progress || progress.waypoint.x !== waypoint.x || progress.waypoint.z !== waypoint.z) {
      progress = { waypoint: { ...waypoint }, distance, stalledTicks: 0, yieldedTicks }
      this.progress.set(id, progress)
    } else {
      progress.yieldedTicks = yieldedTicks
      if (distance < progress.distance - PROGRESS_METRES) {
        progress.distance = distance
        progress.stalledTicks = 0
      } else progress.stalledTicks += 1
    }
    const isStalled = progress.stalledTicks >= STALLED_TICKS
    return {
      canRepath:
        isStalled ||
        (yieldedTicks >= REPATH_YIELD_TICKS && yieldedTicks % REPATH_YIELD_TICKS === 0),
      isStalled,
      isBodyBlocked: this.isBodyBlocked(id)
    }
  }

  isBodyBlocked(id: string): boolean {
    return (this.blocked.get(id)?.ticks ?? 0) >= BODY_BLOCKED_TICKS
  }

  retried(id: string): void {
    const progress = this.progress.get(id)
    if (progress) progress.stalledTicks = 0
  }
}
