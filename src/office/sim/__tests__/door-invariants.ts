import {
  SUBAGENT_BODY_RADIUS,
  WORKER_BODY_RADIUS,
  type BodyFootprint
} from '../../../shared/office/body-footprints'
import { bodiesShareElevation } from '../../../shared/office/body-sweep'
import type { AgentView } from '../../../shared/office/types'

export const TICK_MS = 100
// Ghosting (verifier E6) breaks the clearance check, teleporting (E7) the step check.
const CLEARANCE_SLACK_METRES = 0.02
const MAX_STEP_METRES = 0.14 + 1e-6
// A walker that gains no half metre in this long is jammed: a passage yield stands aside
// 8 s at most, and the stall timer lets a walker stand 12 s.
const BLOCKED_LIMIT_MS = 9_000
const PROGRESS_METRES = 0.5

const footprint = (view: AgentView): BodyFootprint => ({
  id: view.agentKey,
  x: view.x,
  z: view.z,
  elevation: view.elevation ?? 0,
  radius: view.isSubagent ? SUBAGENT_BODY_RADIUS : WORKER_BODY_RADIUS
})

const pairOf = (first: string, second: string): string => [first, second].sort().join('\n')

function isOverlapping(first: BodyFootprint, second: BodyFootprint): boolean {
  const gap = Math.hypot(first.x - second.x, first.z - second.z)
  return (
    bodiesShareElevation(first, second) &&
    gap < first.radius + second.radius - CLEARANCE_SLACK_METRES
  )
}

export interface Violation {
  atMs: number
  detail: string
}

// Watches every tick for the three ways a jammed door can be "cleared" dishonestly.
export class DoorInvariants {
  private overlap: Violation | null = null
  private jump: Violation | null = null
  private blocked: Violation | null = null
  private previous = new Map<string, AgentView>()
  private anchors = new Map<string, { x: number; z: number; sinceMs: number }>()
  // Like the sim, no body until seated: first seen faded, faded on rejoining, or fade restarted.
  private arriving = new Set<string>()
  // A relayout carried a seated agent onto a leaver fading where it stood: that pair may overlap.
  private carried = new Set<string>()

  constructor(private readonly isResting: (view: AgentView) => boolean) {}

  check(views: readonly AgentView[], atMs: number): void {
    const current = new Map(views.map((view) => [view.agentKey, view]))
    for (const key of this.arriving)
      if (current.get(key)?.fade === undefined) this.arriving.delete(key)
    for (const view of views) {
      const before = this.previous.get(view.agentKey)
      if (
        view.fade !== undefined &&
        (!before ||
          (before.fade !== undefined && view.fade < before.fade) ||
          (before.place === 'leaving' && view.place !== 'leaving'))
      )
        this.arriving.add(view.agentKey)
    }
    this.recordCarries(views)
    this.checkClearance(views, atMs)
    for (const view of views) {
      const before = this.previous.get(view.agentKey)
      // A recall fades out first, so its move to the desk is never seen (FOUND 7).
      const step =
        before && before.fade === undefined ? Math.hypot(view.x - before.x, view.z - before.z) : 0
      if (!this.jump && step > MAX_STEP_METRES)
        this.jump = { atMs, detail: `${view.agentKey} stepped ${step.toFixed(3)} m` }
      this.checkProgress(view, atMs)
    }
    for (const key of this.anchors.keys()) if (!current.has(key)) this.anchors.delete(key)
    this.previous = current
  }

  report(): Record<'overlap' | 'jump' | 'blocked', Violation | null> {
    return { overlap: this.overlap, jump: this.jump, blocked: this.blocked }
  }

  private recordCarries(views: readonly AgentView[]): void {
    const leavers = views.filter((view) => view.place === 'leaving').map(footprint)
    for (const view of views) {
      const before = this.previous.get(view.agentKey)
      const step = before ? Math.hypot(view.x - before.x, view.z - before.z) : 0
      if (step <= MAX_STEP_METRES || !this.isResting(view)) continue
      for (const leaver of leavers)
        if (isOverlapping(footprint(view), leaver))
          this.carried.add(pairOf(view.agentKey, leaver.id))
    }
  }

  private checkClearance(views: readonly AgentView[], atMs: number): void {
    if (this.overlap) return
    const bodies = views.filter((view) => !this.arriving.has(view.agentKey)).map(footprint)
    for (let first = 0; first < bodies.length; first++)
      for (let second = first + 1; second < bodies.length; second++) {
        const [a, b] = [bodies[first], bodies[second]]
        if (!isOverlapping(a, b) || this.carried.has(pairOf(a.id, b.id))) continue
        const gap = Math.hypot(a.x - b.x, a.z - b.z)
        this.overlap = { atMs, detail: `${a.id} and ${b.id} are ${gap.toFixed(3)} m apart` }
        return
      }
  }

  private checkProgress(view: AgentView, atMs: number): void {
    const anchor = this.anchors.get(view.agentKey)
    if (
      !anchor ||
      this.isResting(view) ||
      Math.hypot(view.x - anchor.x, view.z - anchor.z) > PROGRESS_METRES
    ) {
      this.anchors.set(view.agentKey, { x: view.x, z: view.z, sinceMs: atMs })
      return
    }
    if (this.blocked || atMs - anchor.sinceMs <= BLOCKED_LIMIT_MS) return
    this.blocked = {
      atMs,
      detail: `${view.agentKey} held near (${anchor.x.toFixed(2)}, ${anchor.z.toFixed(2)}) since ${anchor.sinceMs} ms`
    }
  }
}
