import { describe, expect, it } from 'vitest'
import { crownTopOf } from '../../logic/building-place'
import { listThemes } from '../../themes/registry'
import { makeFloor } from '../../__tests__/fixtures'
import { floorElevation, PHYSICAL_STOREY_HEIGHT } from '../all-floor-model'
import { CROWN_RISE_MAX_M, MARK_RISE_M, markCeiling, markClipBox } from '../city-marks'

const tower = (storeys: number) =>
  Array.from({ length: storeys }, (_, index) =>
    makeFloor({ floorId: `storey-${index}`, elevation: index * PHYSICAL_STOREY_HEIGHT })
  )

describe('room above the roofs for city marks', () => {
  it('a mark over a roof at 24 m or higher still rises', () => {
    expect(markCeiling({ x: 0, y: 30, z: 0 })).toBe(30 + MARK_RISE_M)
  })

  it('every theme’s crown rises at most CROWN_RISE_MAX_M above its top storey', () => {
    for (const theme of listThemes())
      for (const floors of [tower(1), tower(3)]) {
        const roof = floorElevation(floors[floors.length - 1]) + PHYSICAL_STOREY_HEIGHT
        expect((crownTopOf(floors, theme)?.y ?? roof) - roof).toBeLessThanOrEqual(CROWN_RISE_MAX_M)
      }
  })

  it('the horizon’s clip box holds the tallest mark over the tallest crown', () => {
    const scene = { x: 0, z: 0, width: 80, depth: 60, minY: 0, maxY: 30 }
    expect(markClipBox(scene)).toEqual({ ...scene, maxY: 30 + CROWN_RISE_MAX_M + MARK_RISE_M })
  })
})
