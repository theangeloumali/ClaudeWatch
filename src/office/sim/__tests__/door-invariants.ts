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
// A walker that gains no half metre in this long is jammed: leavers fade at once, so no
// doorway wait is this long any more.
const BLOCKED_LIMIT_MS = 16_500
const PROGRESS_METRES = 0.5

const footprint = (view: AgentView): BodyFootprint => ({
  id: view.agentKey,
  x: view.x,
  z: view.z,
  elevation: view.elevation ?? 0,
  connectorId: view.connectorId,
  radius: view.isSubagent ? SUBAGENT_BODY_RADIUS : WORKER_BODY_RADIUS
})

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
  // First seen faded, so fading in: like the sim, not a body until it is seated.
  private arriving = new Set<string>()

  constructor(private readonly isResting: (view: AgentView) => boolean) {}

  check(views: readonly AgentView[], atMs: number): void {
    const current = new Map(views.map((view) => [view.agentKey, view]))
    for (const key of this.arriving)
      if (current.get(key)?.fade === undefined) this.arriving.delete(key)
    for (const view of views)
      if (view.fade !== undefined && !this.previous.has(view.agentKey))
        this.arriving.add(view.agentKey)
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

  private checkClearance(views: readonly AgentView[], atMs: number): void {
    if (this.overlap) return
    // A leaver stays carved out: a relayout slides a seated desk onto one fading where it stood.
    const bodies = views
      .filter((view) => !this.arriving.has(view.agentKey) && view.place !== 'leaving')
      .map(footprint)
    for (let first = 0; first < bodies.length; first++)
      for (let second = first + 1; second < bodies.length; second++) {
        const [a, b] = [bodies[first], bodies[second]]
        if (!bodiesShareElevation(a, b)) continue
        const gap = Math.hypot(a.x - b.x, a.z - b.z)
        if (gap >= a.radius + b.radius - CLEARANCE_SLACK_METRES) continue
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
