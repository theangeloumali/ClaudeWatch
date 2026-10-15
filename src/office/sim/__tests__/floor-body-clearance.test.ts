import { expect, it } from 'vitest'
import { bodyFits } from '../../../shared/office/body-footprints'

it('does not block a worker by a different usable storey at the same XZ position', () => {
  const lower = { id: 'lower', x: 0, z: 0, radius: 0.65, elevation: 0 }
  const upper = { id: 'upper', x: 0, z: 0, radius: 0.65, elevation: 5.5 }
  expect(bodyFits(lower, [upper])).toBe(true)
  expect(bodyFits(lower, [{ ...upper, ...{ elevation: 0 } }])).toBe(false)
})
