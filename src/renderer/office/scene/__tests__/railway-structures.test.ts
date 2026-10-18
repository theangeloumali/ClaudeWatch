import { Group } from 'three'
import { describe, expect, it } from 'vitest'
import { makeFloor } from '../../__tests__/fixtures'
import { CITY_LAYER_BUDGET, measureLayer } from '../../themes/city-layer-budget.test-utils'
import { getTheme } from '../../themes/registry'
import { distributedTown } from '../../town/distributed-town'
import { railwayPlan } from '../../town/railway-plan'
import { townOf } from '../../town/use-town-plan'
import { viaductMesh } from '../RailwayStructures'

const floors = [0, 1, 2, 3].map((index) =>
  makeFloor({ floorId: `f${index}`, x: (index % 2) * 64 + 32, z: Math.floor(index / 2) * 56 + 28 })
)
const plan = distributedTown(townOf(floors[0], null), floors).plan
const railway = railwayPlan(plan)
const { palette } = getTheme('corporate-city')

describe('RailwayStructures', () => {
  it('the viaduct is 1 draw', () => {
    if (!railway) throw new Error('no railway')
    const layer = new Group().add(viaductMesh(railway, palette))
    const first = measureLayer(layer)
    expect(first.draws).toBe(1)
    expect(first.draws).toBeLessThanOrEqual(CITY_LAYER_BUDGET.railway.draws.light)
    // Placed once: a still frame sends nothing.
    expect(measureLayer(layer).uploadBytes).toBe(0)
    expect(first.triangles).toBeLessThan(20_000)
  })
})
