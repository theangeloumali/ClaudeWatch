import type { Point } from './path'

const PROGRESS_METRES = 0.05
const REPATH_YIELD_TICKS = 10
// A passing detour lasts eight seconds; allow it to finish before treating a waypoint as stuck.
const STALLED_TICKS = 120

interface Progress {
  waypoint: Point
  distance: number
  stalledTicks: number
  yieldedTicks: number
}

// dry-new: body clearance is stateless; recovery also needs sustained progress toward a waypoint.
export class MovementRecovery {
  private readonly progress = new Map<string, Progress>()

  clear(id: string): void {
    this.progress.delete(id)
  }

  record({
    id,
    position,
    waypoint,
    hasYielded
  }: {
    id: string
    position: Point
    waypoint?: Point
    hasYielded: boolean
  }): { canRepath: boolean; isStalled: boolean } {
    if (!waypoint) {
      this.clear(id)
      return { canRepath: false, isStalled: false }
    }
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
      isStalled
    }
  }

  retried(id: string): void {
    const progress = this.progress.get(id)
    if (progress) progress.stalledTicks = 0
  }
}
