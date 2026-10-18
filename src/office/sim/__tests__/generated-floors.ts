import type { SessionRef } from '../../../shared/office/types'
import { createWorldDocument } from '../../../shared/office/world-document'
import { resolveEffectiveWorld } from '../effective-world'
import { session, subagent } from '../fixtures'
import { buildLayout, type LayoutMap } from '../layout'

// Rosters of 1 to 24 sessions, in one project or spread over three, every fourth lead with a crew.
export function rosters(): SessionRef[][] {
  return [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24].flatMap((count) =>
    [1, 3].map((projects) =>
      Array.from({ length: count }, (_, index) => ({
        ...session(`claude:r-${index}`, `p_${index % projects}`),
        subagents: index % 4 ? [] : [subagent('x'), subagent('y')]
      }))
    )
  )
}

// The effective world the live Office builds from a fresh generated document.
export function generatedMap(sessions: SessionRef[]): LayoutMap {
  const base = buildLayout(sessions, undefined)
  return resolveEffectiveWorld(base, createWorldDocument(base, sessions), sessions)
}
