import { expect, it } from 'vitest'
import { cityScenerySites } from '../city-scenery'
import { CITY_FRONTAGE_SETBACK_METRES } from '../city-block-layout'
import { overlaps } from '../world-document-geometry'

it('fills real urban gaps while keeping buildings, venue entrances and cardinal streets clear', () => {
  const buildings = [
    { x: 0, z: -48, width: 30, depth: 25 },
    { x: 48, z: 0, width: 30, depth: 25 }
  ]
  const sites = cityScenerySites(buildings)
  expect(sites.length).toBeGreaterThan(0)
  expect(sites.length).toBeLessThanOrEqual(64)
  expect(new Set(sites.map((site) => site.id)).size).toBe(sites.length)
  expect(sites.some((site) => Math.abs(site.x) < 50 && Math.abs(site.z) < 50)).toBe(true)
  expect(sites.every((site) => Math.abs(site.x) >= 12 && Math.abs(site.z) >= 12)).toBe(true)
  for (const [index, site] of sites.entries()) {
    for (const other of sites.slice(index + 1)) expect(overlaps(site, other)).toBe(false)
    for (const building of buildings) {
      expect(
        Math.abs(site.x - building.x) >=
          (site.width + building.width) / 2 + CITY_FRONTAGE_SETBACK_METRES - 1e-8 ||
          Math.abs(site.z - building.z) >=
            (site.depth + building.depth) / 2 + CITY_FRONTAGE_SETBACK_METRES - 1e-8
      ).toBe(true)
    }
  }
  expect(cityScenerySites(buildings)).toEqual(sites)
})
