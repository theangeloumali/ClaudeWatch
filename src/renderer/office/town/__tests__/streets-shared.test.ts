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

describe('the town plan lays its streets from the layout it is given', () => {
  it('gives a preview layout with a dragged building its own streets', () => {
    const { base, document, sessions } = world()
    const live = rendererRoads(resolveEffectiveWorld(base, document, sessions), sessions)
    const preview = structuredClone(document)
    preview.buildings[0].footprint.x += 160
    expect(validateWorldDocument(preview, { layout: base, sessions })).toEqual([])
    const dragged = resolveEffectiveWorld(buildLayout(sessions, undefined), preview, sessions)
    expect(live.length).toBeGreaterThan(0)
    expect(byId(rendererRoads(dragged, sessions))).not.toEqual(byId(live))
  })
})
