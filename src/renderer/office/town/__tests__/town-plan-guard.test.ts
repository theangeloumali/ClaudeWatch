import { beforeEach, expect, it } from 'vitest'
import { officeSettings } from '../../logic/office-settings'
import { pinQuality } from '../../quality-store'
import { BASELINE } from './town-plan-guard.baseline'
import { GUARDED_CITIES, asJson, firstStartTown } from './town-plan-guard.test-utils'

beforeEach(() => {
  officeSettings.reset()
  pinQuality('full')
})

// Saved from 74490a8, when the campus planner was retired: removing it must move nothing.
it.each(GUARDED_CITIES)(
  'lays the %s city exactly as before the campus went',
  (name, floor, sites) => {
    const { roads, lots, blocks, officeSites, extent, claim, size } = firstStartTown(
      floor,
      sites
    ).plan
    expect(asJson({ roads, lots, blocks, officeSites, extent, claim, size })).toEqual(
      BASELINE[name]
    )
  }
)
