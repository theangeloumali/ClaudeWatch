import { beforeEach, expect, it } from 'vitest'
import { officeSettings } from '../../logic/office-settings'
import { pinQuality } from '../../quality-store'
import type { TownSize } from '../town-grid'
import { BASELINE } from './town-plan-guard.baseline'
import { GUARDED_CITIES, asJson, firstStartTown } from './town-plan-guard.test-utils'

beforeEach(() => {
  officeSettings.reset()
  pinQuality('full')
})

const laidOut = (...[floor, sites, size]: Parameters<typeof firstStartTown>) => {
  const { roads, lots, blocks, officeSites, extent, claim } = firstStartTown(
    floor,
    sites,
    size
  ).plan
  return asJson({ roads, lots, blocks, officeSites, extent, claim })
}

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

// The sim reads the same lots as street obstacles: a size only decides what the renderer draws.
it.each(GUARDED_CITIES)(
  'every size lays out the same streets and lots: %s',
  (_name, floor, sites) => {
    const city = laidOut(floor, sites, 'city')
    for (const size of ['village', 'town'] satisfies TownSize[])
      expect(laidOut(floor, sites, size), size).toEqual(city)
  }
)
