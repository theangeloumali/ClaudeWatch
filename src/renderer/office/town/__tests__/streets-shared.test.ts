import { describe, expect, it } from 'vitest'
import { cityVenueSite } from '../../../../shared/office/city-access'
import type { TownRoad } from '../../../../shared/office/town-roads'
import {
  createWorldDocument,
  validateWorldDocument,
  type WorldDocument
} from '../../../../shared/office/world-document'
import type { SessionRef } from '../../../../shared/office/types'
import { toFloorGeometry } from '../../../office-live/layout-geometry'
import { distributedTown } from '../distributed-town'
import { townOf } from '../use-town-plan'
import { resolveEffectiveWorld } from '../../../../office/sim/effective-world'
import { session } from '../../../../office/sim/fixtures'
import { buildLayout, type LayoutMap } from '../../../../office/sim/layout'

const byId = (roads: readonly TownRoad[]): TownRoad[] =>
  [...roads].sort((first, second) => first.id.localeCompare(second.id))

// The roads OfficeScene's town plan lays for a layout: its ground floors and venues, as
// useTownPlan receives them through the frame.
function rendererRoads(layout: LayoutMap, sessions: readonly SessionRef[]): TownRoad[] {
  const ground = toFloorGeometry(layout, sessions).filter((floor) => (floor.elevation ?? 0) === 0)
  const sites = [...ground, ...(layout.effectiveVenues ?? []).map(cityVenueSite)]
  return distributedTown(townOf(ground[0], null), sites).plan.roads
}

function world(): { base: LayoutMap; document: WorldDocument; sessions: SessionRef[] } {
  const sessions = [session('one'), session('two', 'p_b'), session('three', 'p_c')]
  const base = buildLayout(sessions, undefined)
  return { base, document: createWorldDocument(base, sessions), sessions }
}

describe('one street list for the sim, the renderer and the editor preview', () => {
  it('gives the live layout the streets the renderer plan lays', () => {
    const { base, document, sessions } = world()
    const live = resolveEffectiveWorld(base, document, sessions)
    expect(live.streets?.length).toBeGreaterThan(0)
    expect(byId(live.streets ?? [])).toEqual(byId(rendererRoads(live, sessions)))
  })

  it('gives a preview layout with a dragged building its own streets', () => {
    const { base, document, sessions } = world()
    const live = resolveEffectiveWorld(base, document, sessions)
    const preview = structuredClone(document)
    preview.buildings[0].footprint.x += 160
    expect(validateWorldDocument(preview, { layout: base, sessions })).toEqual([])
    const dragged = resolveEffectiveWorld(buildLayout(sessions, undefined), preview, sessions)
    expect(byId(dragged.streets ?? [])).not.toEqual(byId(live.streets ?? []))
    expect(byId(dragged.streets ?? [])).toEqual(byId(rendererRoads(dragged, sessions)))
  })
})
