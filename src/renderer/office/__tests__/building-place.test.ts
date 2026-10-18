import { describe, expect, it } from 'vitest'
import { createBuildingPlaces, crownTopOf } from '../logic/building-place'
import { SPIRE_BASE_GAP_M, SPIRE_MAX_M, SPIRE_MAX_STAGES, spireHeight } from '../logic/token-spires'
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

describe('buildingPlaces', () => {
  it('has no top for a building it has no roof for', () => {
    const places = createBuildingPlaces()
    places.setStage('b1', 2, 0)
    expect(places.topAt('b1', 0, false)).toBeNull()
    places.setRoof('b1', ROOF)
    places.setRoof('b1', null)
    expect(places.topAt('b1', 0, false)).toBeNull()
  })

  it('a first stage is settled at once: an opened Office shows its spires finished', () => {
    const places = createBuildingPlaces()
    places.setRoof('b1', ROOF)
    places.setStage('b1', 3, 1_000)
    expect(places.topAt('b1', 1_000, false)?.y).toBeCloseTo(
      ROOF.y + SPIRE_BASE_GAP_M + spireHeight(3)
    )
    expect(places.topAt('b2', 1_000, false)).toBeNull()
  })

  it('every mark rides a growing spire', () => {
    const places = createBuildingPlaces()
    places.setRoof('b1', ROOF)
    places.setStage('b1', 0, 0)
    expect(places.topAt('b1', 0, false)).toEqual(ROOF)
    places.setStage('b1', 2, 10_000)
    let previous = ROOF.y
    for (let step = 0; step <= 12; step++) {
      const atMs = 10_000 + step * 100
      const y = places.topAt('b1', atMs, false)?.y ?? Number.NaN
      expect(y).toBeGreaterThanOrEqual(previous)
      previous = y
    }
    expect(places.topAt('b1', 10_600, false)?.y).toBeLessThan(
      ROOF.y + SPIRE_BASE_GAP_M + spireHeight(2)
    )
    expect(places.topAt('b1', 11_200, false)?.y).toBeCloseTo(
      ROOF.y + SPIRE_BASE_GAP_M + spireHeight(2)
    )
  })

  it('reduced motion snaps to the new stage', () => {
    const places = createBuildingPlaces()
    places.setRoof('b1', ROOF)
    places.setStage('b1', 1, 0)
    places.setStage('b1', 3, 5_000)
    expect(places.topAt('b1', 5_000, true)?.y).toBeCloseTo(
      ROOF.y + SPIRE_BASE_GAP_M + spireHeight(3)
    )
  })

  it('the day rollover eases a spire down from where it stood, never dropping it at once', () => {
    const places = createBuildingPlaces()
    places.setRoof('b1', ROOF)
    places.setStage('b1', 4, 0)
    places.setStage('b1', 0, 60_000)
    expect(places.topAt('b1', 60_000, false)?.y).toBeCloseTo(
      ROOF.y + SPIRE_BASE_GAP_M + spireHeight(4)
    )
    expect(places.topAt('b1', 60_600, false)?.y).toBeLessThan(
      ROOF.y + SPIRE_BASE_GAP_M + spireHeight(4)
    )
    expect(places.topAt('b1', 61_200, false)).toEqual(ROOF)
  })

  it('a settled spire hands out the same top every frame, and a new roof moves it', () => {
    const places = createBuildingPlaces()
    places.setRoof('b1', ROOF)
    places.setStage('b1', 2, 0)
    const settled = places.topAt('b1', 5_000, false)
    expect(places.topAt('b1', 5_016, false)).toBe(settled)
    places.setRoof('b1', { ...ROOF, y: 12 })
    expect(places.topAt('b1', 5_032, false)?.y).toBeCloseTo(12 + SPIRE_BASE_GAP_M + spireHeight(2))
  })

  it('bumps its version on a change, and eases only after a live crossing', () => {
    const places = createBuildingPlaces()
    const start = places.version()
    places.setRoof('b1', ROOF)
    places.setStage('b1', 1, 0)
    expect(places.isEasing(0, false)).toBe(false)
    places.setStage('b1', 2, 1_000)
    expect(places.version()).toBeGreaterThan(start)
    expect(places.isEasing(1_600, false)).toBe(true)
    expect(places.isEasing(1_600, true)).toBe(false)
    expect(places.isEasing(2_200, false)).toBe(false)
  })

  it('a spire on a five-storey office rises its full stage', () => {
    const tower = Array.from({ length: 5 }, (_, level) =>
      makeFloor({
        floorId: `t${level}`,
        buildingId: 'tall',
        elevation: level * PHYSICAL_STOREY_HEIGHT
      })
    )
    const roof = crownTopOf(tower, theme)
    if (!roof) throw new Error('a tower has a roof')
    const places = createBuildingPlaces()
    places.setRoof('tall', roof)
    places.setStage('tall', SPIRE_MAX_STAGES, 0)
    expect(places.topAt('tall', 0, false)?.y).toBeCloseTo(roof.y + SPIRE_BASE_GAP_M + SPIRE_MAX_M)
  })
})
