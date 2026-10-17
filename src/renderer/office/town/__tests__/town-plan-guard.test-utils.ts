import { renderHook } from '@testing-library/react'
import type { WorldFootprint } from '../../../../shared/office/world-document'
import { makeFloor } from '../../__tests__/fixtures'
import type { FloorGeometry } from '../../scene-model'
import { LARGE_FLOOR, LONE_FLOOR } from '../town.test-utils'
import { useTownPlan, type Town } from '../use-town-plan'

const TWO_OFFICE_FLOOR = makeFloor({ floorId: 'two-offices', x: 0, z: 0, width: 150, depth: 150 })

// The three cities the scene can stand in: two offices, one, and none yet.
export const GUARDED_CITIES: readonly (readonly [string, FloorGeometry, WorldFootprint[]])[] = [
  [
    'two-office',
    TWO_OFFICE_FLOOR,
    [
      { x: 0, z: -48, width: 30, depth: 25 },
      { x: 48, z: 0, width: 30, depth: 25 }
    ]
  ],
  ['one-office', LARGE_FLOOR, [LARGE_FLOOR]],
  ['empty', LONE_FLOOR, []]
]

// The Town a first start hands the scene, with nothing stored.
export function firstStartTown(floor: FloorGeometry, protectedSites: WorldFootprint[]): Town {
  localStorage.clear()
  return renderHook(() => useTownPlan(floor, { protectedSites })).result.current
}

// JSON drops `undefined` fields, so both sides of a comparison go through it.
export const asJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value))
