import { Group } from 'three'
import { describe, expect, it } from 'vitest'
import { makeFloor } from '../../__tests__/fixtures'
import { QUALITY_LEVELS } from '../../logic/quality'
import { CITY_LAYER_BUDGET, measureLayer } from '../../themes/city-layer-budget.test-utils'
import { getTheme } from '../../themes/registry'
import { distributedTown } from '../../town/distributed-town'
import { railwayPlan } from '../../town/railway-plan'
import { townOf } from '../../town/use-town-plan'
import { viaductMesh } from '../RailwayStructures'
import { trainSet } from '../RailwayTrains'

// A 4 × 3-block city, the size the research measured.
const floors = Array.from({ length: 12 }, (_unused, index) =>
  makeFloor({ floorId: `f${index}`, x: (index % 4) * 64 + 32, z: Math.floor(index / 4) * 56 + 28 })
)
const railway = railwayPlan(distributedTown(townOf(floors[0], null), floors).plan)
const { palette } = getTheme('cyberpunk-city')
const T0 = 1_760_000_000_000

describe('railway budget rows', () => {
  it.each(QUALITY_LEVELS)(
    'budget rows: railway ≤ 4/2/1 draws (full/balanced/light), trains ≤ 2 kB a frame — at %s',
    (level) => {
      if (!railway) throw new Error('no railway')
      const trains = trainSet(railway, level, palette)
      const layer = new Group().add(viaductMesh(railway, palette), trains.group)
      trains.pose(T0)
      const first = measureLayer(layer)
      expect(first.draws).toBeLessThanOrEqual(CITY_LAYER_BUDGET.railway.draws[level])
      expect(first.triangles).toBeLessThan(20_000)
      trains.pose(T0 + 200)
      expect(measureLayer(layer).uploadBytes).toBeLessThanOrEqual(
        CITY_LAYER_BUDGET.trains.uploadBytes
      )
    }
  )
})
