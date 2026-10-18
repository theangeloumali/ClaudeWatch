import type { AgentView, SessionRef, SourceHealth } from '../../../shared/office/types'
import { createWorldDocument } from '../../../shared/office/world-document'
import type { WorldDocument } from '../../../shared/office/world-document-types'
import { resolveEffectiveWorld } from '../effective-world'
import { session } from '../fixtures'
import { deskOf, type LayoutMap } from '../layout'
import { World } from '../world'
import { TICK_MS } from './door-invariants'

const SOURCE_ID = 'source'
const SEAT_METRES = 0.16

const SOURCES: SourceHealth[] = [{ id: SOURCE_ID, ok: true, detail: '' }]

// A session as the observing bridge stamps it: its own record, fresh at `nowMs`.
export function observed(key: string, project: string, nowMs: number): SessionRef {
  return {
    ...session(key, project),
    observation: {
      sourceId: SOURCE_ID,
      coverage: 'own',
      observedAtMs: nowMs,
      staleAfterMs: 3_600_000
    }
  }
}

// The effective world from the generated document, after `reshape` edits it.
const resolveWith =
  (reshape: (document: WorldDocument) => void) =>
  (base: LayoutMap, current: readonly SessionRef[]): LayoutMap => {
    const document = createWorldDocument(base, current)
    reshape(document)
    return resolveEffectiveWorld(base, document, current)
  }

// The city as the live Office runs it: the effective world and its own clock.
export class CityWorld {
  clock = 1_000_000
  readonly world: World
  private sequence = 1

  constructor(
    sessions: (nowMs: number) => SessionRef[],
    reshape: (document: WorldDocument) => void = () => {}
  ) {
    this.world = new World({ resolveLayout: resolveWith(reshape), now: () => this.clock })
    this.world.apply({
      type: 'hello',
      v: 1,
      snapshot: {
        rev: 1,
        generatedAtMs: this.clock,
        sessions: sessions(this.clock),
        sources: SOURCES
      }
    })
  }

  patch(upserts: SessionRef[], removed: string[] = []): void {
    this.world.apply({ type: 'patch', v: 1, seq: ++this.sequence, upserts, removed })
  }

  step(): AgentView[] {
    this.clock += TICK_MS
    return this.world.step(TICK_MS)
  }

  run(ms: number, onFrame: (views: AgentView[], elapsedMs: number) => boolean | void): void {
    for (let elapsed = TICK_MS; elapsed <= ms; elapsed += TICK_MS)
      if (onFrame(this.step(), elapsed) === true) return
  }

  isSeated(view: AgentView | undefined): boolean {
    const desk = view && deskOf(this.world.layout().floors, view)?.desk
    return (
      !!view &&
      !!desk &&
      view.place === undefined &&
      view.physicalFloorId === view.floorId &&
      Math.hypot(view.x - desk.x, view.z - desk.z) <= SEAT_METRES
    )
  }
}
