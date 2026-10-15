import { bodyFits, type BodyPoint, type BodyStepOptions } from './body-footprints'
import { bodiesShareElevation } from './body-sweep'

// dry-new: swept steps are stateless; a narrow doorway needs a remembered, bounded yielding detour.
type BodyWalker = Pick<BodyStepOptions, 'body' | 'to'>
interface PassageOptions extends BodyStepOptions {
  readonly isExiting?: boolean
  readonly walkers: readonly BodyWalker[]
  readonly tick: number
  readonly routeTo: (target: BodyPoint) => BodyPoint[]
}
interface Passage {
  readonly leaderId: string
  readonly untilTick: number
  readonly route: BodyPoint[]
}

const YIELD_TICKS = 80
const PASS_CLEARANCE_METRES = 2
const YIELD_MARGIN_METRES = 0.35
const WAYPOINT_EPSILON_METRES = 1e-8

export class BodyPassages {
  private readonly passages = new Map<string, Passage>()

  clear(id: string): void {
    this.passages.delete(id)
  }

  guide(options: PassageOptions): BodyPoint {
    const budget = Math.hypot(options.to.x - options.body.x, options.to.z - options.body.z)
    if (budget <= WAYPOINT_EPSILON_METRES) return options.to
    let passage = this.passages.get(options.body.id)
    if (passage) {
      const leader = options.obstacles.find((body) => body.id === passage?.leaderId)
      if (
        !leader ||
        !bodiesShareElevation(options.body, leader) ||
        options.tick >= passage.untilTick ||
        Math.hypot(leader.x - options.body.x, leader.z - options.body.z) >
          leader.radius + options.body.radius + PASS_CLEARANCE_METRES
      ) {
        this.passages.delete(options.body.id)
        passage = undefined
      }
    }
    passage ??= this.begin(options)
    if (!passage) return options.to
    while (
      passage.route.length &&
      Math.hypot(passage.route[0].x - options.body.x, passage.route[0].z - options.body.z) <=
        WAYPOINT_EPSILON_METRES
    )
      passage.route.shift()
    const target = passage.route[0]
    if (!target) return { x: options.body.x, z: options.body.z }
    const distance = Math.hypot(target.x - options.body.x, target.z - options.body.z)
    const fraction = Math.min(1, budget / distance)
    return {
      x: options.body.x + (target.x - options.body.x) * fraction,
      z: options.body.z + (target.z - options.body.z) * fraction
    }
  }

  private begin(options: PassageOptions): Passage | undefined {
    const dx = options.to.x - options.body.x
    const dz = options.to.z - options.body.z
    const distance = Math.hypot(dx, dz)
    const leader = [...options.walkers]
      .sort((first, second) => first.body.id.localeCompare(second.body.id))
      .find((walker) => {
        if (walker.body.id >= options.body.id) return false
        if (!bodiesShareElevation(options.body, walker.body)) return false
        const gapX = walker.body.x - options.body.x
        const gapZ = walker.body.z - options.body.z
        const gap = Math.hypot(gapX, gapZ)
        if (gap > walker.body.radius + options.body.radius + YIELD_MARGIN_METRES) return false
        const otherDx = walker.to.x - walker.body.x
        const otherDz = walker.to.z - walker.body.z
        const otherDistance = Math.hypot(otherDx, otherDz)
        if (otherDistance <= WAYPOINT_EPSILON_METRES) return false
        const forwardProjection = (dx * gapX + dz * gapZ) / distance
        const otherProjection = (otherDx * gapX + otherDz * gapZ) / otherDistance
        const alignment = (dx * otherDx + dz * otherDz) / (distance * otherDistance)
        // Converging exits also need a leader; parallel queues and diverging paths do not.
        return (
          alignment < (options.isExiting ? 0.5 : -0.5) &&
          forwardProjection > 0 &&
          forwardProjection > otherProjection
        )
      })
    if (!leader) return undefined
    const span = options.body.radius + leader.body.radius + YIELD_MARGIN_METRES
    const forward = { x: dx / distance, z: dz / distance }
    for (const [side, retreat] of [
      [1, 0],
      [-1, 0],
      [1, 1],
      [-1, 1],
      [0, 1]
    ]) {
      const target = {
        x: options.body.x + (forward.z * side - forward.x * retreat) * span,
        z: options.body.z + (-forward.x * side - forward.z * retreat) * span
      }
      if (!options.isOpen(target) || !bodyFits({ ...options.body, ...target }, options.obstacles))
        continue
      const route = options.routeTo(target)
      if (!route.length) continue
      const passage = { leaderId: leader.body.id, untilTick: options.tick + YIELD_TICKS, route }
      this.passages.set(options.body.id, passage)
      return passage
    }
    return undefined
  }
}
