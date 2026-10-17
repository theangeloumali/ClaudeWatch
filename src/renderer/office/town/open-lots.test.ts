import { describe, expect, it } from 'vitest'
import { listThemes } from '../themes/registry'
import { GUARDED_CITIES } from './__tests__/town-plan-guard.test-utils'
import { distributedTown } from './distributed-town'
import { townDressOf } from './drawn-town.test-utils'
import { fallbackDress } from './fallback-dress'
import { builtLotIds, dressTown } from './open-lots'
import type { TownDress } from './town-dress'
import type { TownSize } from './town-grid'
import { townOf } from './use-town-plan'

const [, TWO_OFFICES, OFFICE_SITES] = GUARDED_CITIES[0]
const cityAt = (size: TownSize, floor = TWO_OFFICES) =>
  distributedTown(townOf(floor, null, size), OFFICE_SITES).plan

// The filler lots a size stands a building on: every lot but the landmarks, which always build.
function fillerBuildings(size: TownSize, dress: TownDress = townDressOf('orbital-garrison')) {
  const plan = cityAt(size)
  const landmarks = new Set(plan.lots.filter((lot) => lot.isLandmark).map((lot) => lot.id))
  return dressTown(plan, dress).filter(
    (placed) =>
      !landmarks.has(placed.lot.id) && placed.parts.length > 0 && placed.design !== dress.garden
  )
}

const openIds = (size: TownSize): Set<string> => {
  const plan = cityAt(size)
  const built = builtLotIds(plan)
  return new Set(plan.lots.filter((lot) => !built.has(lot.id)).map((lot) => lot.id))
}

describe('the town size in the two-office city', () => {
  it('Village draws about a third of the filler buildings City draws', () => {
    const city = fillerBuildings('city').length
    expect(city).toBe(cityAt('city').lots.filter((lot) => !lot.isLandmark).length)
    expect(Math.abs(fillerBuildings('village').length / city - 1 / 3)).toBeLessThanOrEqual(0.05)
    expect(Math.abs(fillerBuildings('town').length / city - 2 / 3)).toBeLessThanOrEqual(0.05)
  })

  it('keeps every landmark lot built in a village', () => {
    const plan = cityAt('village')
    const landmarks = plan.lots.filter((lot) => lot.isLandmark)
    expect(landmarks.length).toBeGreaterThan(0)
    for (const lot of landmarks) expect(builtLotIds(plan).has(lot.id), lot.id).toBe(true)
  })

  it('a lot’s built-or-open pick is stable across recomputes', () => {
    const picks = (size: TownSize) => [...builtLotIds(cityAt(size, structuredClone(TWO_OFFICES)))]
    expect(picks('village')).toEqual(picks('village'))
    // Neither the order the lots come in nor a larger size takes a built lot away.
    const plan = cityAt('village')
    expect(builtLotIds({ ...plan, lots: [...plan.lots].reverse() })).toEqual(builtLotIds(plan))
    const town = builtLotIds(cityAt('town'))
    for (const id of builtLotIds(plan)) expect(town.has(id), id).toBe(true)
    const drawn = () => dressTown(cityAt('village'), townDressOf('brass-workshop'))
    expect(drawn()).toEqual(drawn())
  })

  it.each(listThemes().map((theme) => [theme.id] as const))(
    'lays every open lot of %s out as its garden, the whole lot',
    (themeId) => {
      const dress = townDressOf(themeId)
      const open = openIds('village')
      expect(open.size).toBeGreaterThan(0)
      for (const placed of dressTown(cityAt('village'), dress)) {
        if (!open.has(placed.lot.id)) continue
        expect(placed.design, placed.lot.id).toBe(dress.garden)
        expect(placed.parts.length).toBeGreaterThan(0)
      }
    }
  )

  it('leaves an open lot as plain ground in a theme with no garden', () => {
    const dress = fallbackDress(listThemes()[0].palette)
    expect(dress.garden).toBeUndefined()
    const [open] = openIds('village')
    const placed = dressTown(cityAt('village'), dress).find((each) => each.lot.id === open)
    expect(placed?.parts).toEqual([])
  })
})
