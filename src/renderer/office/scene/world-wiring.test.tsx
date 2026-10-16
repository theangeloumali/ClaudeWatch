import { expect, it } from 'vitest'
import { BAND_ZOOM } from '../logic/camera-bands'

it('extends building zoom while preserving floor and desk bands', () => {
  expect(BAND_ZOOM.building).toBeLessThan(16)
  expect(BAND_ZOOM.floor).toBe(34)
  expect(BAND_ZOOM.desk).toBe(90)
})
