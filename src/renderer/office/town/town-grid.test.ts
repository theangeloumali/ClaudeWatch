import { describe, expect, it } from 'vitest'
import { CLAIM_RELEASE_M, LOT_PITCH_M, ROAD_WIDTH_M, SIDEWALK_M } from './town-grid'

describe('the town lattice', () => {
  it('holds an edge through more than one desk column (5 m) of shrinking', () => {
    expect(CLAIM_RELEASE_M).toBeGreaterThan(LOT_PITCH_M + 5)
  })

  it('leaves a carriageway between the sidewalks of every road', () => {
    for (const road of ['avenue', 'boulevard', 'collector', 'lane'] as const)
      expect(ROAD_WIDTH_M[road]).toBeGreaterThan(SIDEWALK_M[road] * 2)
  })
})
