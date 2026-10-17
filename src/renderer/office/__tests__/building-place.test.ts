import { describe, expect, it } from 'vitest'
import {
  buildingPlace,
  buildingPlaces,
  createBuildingPlaces,
  crownTopOf
} from '../logic/building-place'
import { SPIRE_BASE_GAP_M, spireHeight } from '../logic/token-spires'
import { PHYSICAL_STOREY_HEIGHT } from '../scene/all-floor-model'
import { buildingCrown, buildingExteriorProfile } from '../themes/physical-building-parts'
import { getTheme } from '../themes/registry'
import { makeFloor } from './fixtures'

const theme = getTheme('corporate-city')
const ground = makeFloor({ floorId: 'g', buildingId: 'b1', elevation: 0, x: 4, z: -2 })
const upper = makeFloor({
  floorId: 'u',
  buildingId: 'b1',
  elevation: PHYSICAL_STOREY_HEIGHT,
  x: 4,
  z: -2
})
const ROOF = { x: 4, y: 10, z: -2 }

describe('crownTopOf', () => {
  it('is the top storey’s roof plus the crown the shell draws there', () => {
    const top = crownTopOf([upper, ground], theme)
    const crown = buildingCrown({
      floor: upper,
      theme,
      profile: buildingExteriorProfile({ floor: ground, theme })
    })
    const highest = Math.max(...crown.map((part) => part.at[1] + part.size[1] / 2))
    expect(top).toEqual({ x: 4, y: highest, z: -2 })
    expect(top?.y).toBeGreaterThan(2 * PHYSICAL_STOREY_HEIGHT)
    expect(crownTopOf([], theme)).toBeNull()
  })
})

describe('buildingPlace', () => {
  it('has no top for a building it has no roof for', () => {
    const places = createBuildingPlaces()
    places.setStage('b1', 2, 0)
    expect(places.place('b1').topAt(0, false)).toBeNull()
    places.setRoof('b1', ROOF)
    places.setRoof('b1', null)
    expect(places.place('b1').topAt(0, false)).toBeNull()
  })

  it('a first stage is settled at once: an opened Office shows its spires finished', () => {
    const places = createBuildingPlaces()
    places.setRoof('b1', ROOF)
    places.setStage('b1', 3, 1_000)
    expect(places.place('b1').topAt(1_000, false)?.y).toBeCloseTo(
      ROOF.y + SPIRE_BASE_GAP_M + spireHeight(3)
    )
    expect(places.place('b2').topAt(1_000, false)).toBeNull()
  })

  it('every mark rides a growing spire', () => {
    const places = createBuildingPlaces()
    places.setRoof('b1', ROOF)
    places.setStage('b1', 0, 0)
    const sign = places.place('b1')
    const beacon = places.place('b1')
    expect(sign.topAt(0, false)).toEqual(ROOF)
    places.setStage('b1', 2, 10_000)
    let previous = ROOF.y
    for (let step = 0; step <= 12; step++) {
      const atMs = 10_000 + step * 100
      const y = sign.topAt(atMs, false)?.y ?? Number.NaN
      expect(beacon.topAt(atMs, false)?.y).toBe(y)
      expect(y).toBeGreaterThanOrEqual(previous)
      previous = y
    }
    expect(sign.topAt(10_600, false)?.y).toBeLessThan(ROOF.y + SPIRE_BASE_GAP_M + spireHeight(2))
    expect(sign.topAt(11_200, false)?.y).toBeCloseTo(ROOF.y + SPIRE_BASE_GAP_M + spireHeight(2))
  })

  it('reduced motion snaps to the new stage', () => {
    const places = createBuildingPlaces()
    places.setRoof('b1', ROOF)
    places.setStage('b1', 1, 0)
    places.setStage('b1', 3, 5_000)
    expect(places.place('b1').topAt(5_000, true)?.y).toBeCloseTo(
      ROOF.y + SPIRE_BASE_GAP_M + spireHeight(3)
    )
  })

  it('the day rollover eases a spire down from where it stood, never dropping it at once', () => {
    const places = createBuildingPlaces()
    places.setRoof('b1', ROOF)
    places.setStage('b1', 4, 0)
    places.setStage('b1', 0, 60_000)
    const place = places.place('b1')
    expect(place.topAt(60_000, false)?.y).toBeCloseTo(ROOF.y + SPIRE_BASE_GAP_M + spireHeight(4))
    expect(place.topAt(60_600, false)?.y).toBeLessThan(ROOF.y + SPIRE_BASE_GAP_M + spireHeight(4))
    expect(place.topAt(61_200, false)).toEqual(ROOF)
  })

  it('a spire never lifts a mark above the 24 m height rule', () => {
    const places = createBuildingPlaces()
    places.setRoof('tall', { x: 0, y: 22, z: 0 })
    places.setStage('tall', 6, 0)
    expect(places.place('tall').topAt(0, false)?.y).toBe(24)
    places.setRoof('over', { x: 0, y: 25, z: 0 })
    places.setStage('over', 6, 0)
    expect(places.place('over').topAt(0, false)?.y).toBe(25)
  })
})

it('buildingPlace reads the page’s one store, so every layer sees the same roof', () => {
  buildingPlaces.setRoof('page-b1', ROOF)
  buildingPlaces.setStage('page-b1', 1, 0)
  expect(buildingPlace('page-b1').topAt(0, true)).toEqual(
    buildingPlaces.place('page-b1').topAt(0, true)
  )
  buildingPlaces.setRoof('page-b1', null)
})
