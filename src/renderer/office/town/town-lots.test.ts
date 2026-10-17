import { describe, expect, it } from 'vitest'
import type { QualityLevel } from '../logic/quality'
import { LIVE_FLOORS } from '../themes/floors.test-utils'
import type { Rect } from '../themes/lot-math'
import { campusClaim, neededClaim } from './town-claim'
import { BUILDING_CAP, CLAIM_SETBACK_M, FAR_RING_FROM_M, MIN_BELT_M } from './town-grid'
import { LANDMARK_ZONES, townLots } from './town-lots'
import { roadPromenades, townRoads } from './town-roads'
import { lotSites, parkPromenades } from './town-sites'
import { TOWN_DISTRICTS, ZONE_HEIGHT_CAP_M, zoneHeightCap } from './town-zones'
import {
  LARGE_FLOOR,
  edges,
  fromEdges,
  fullExtent,
  gap,
  median,
  overlapping
} from './town.test-utils'

const HEIGHT_PER_METRE = 0.7

function build(floor: Rect, detail: QualityLevel = 'full') {
  const claim = campusClaim(neededClaim(floor), null)
  const extent = fullExtent(claim)
  const sites = lotSites(claim, extent)
  const promenades = [...roadPromenades(townRoads(claim, extent), claim), ...parkPromenades(sites)]
  return { claim, promenades, sites, lots: townLots(sites, claim, promenades, detail) }
}

describe.each(LIVE_FLOORS)('townLots: %s', (_name, floor) => {
  const { claim, promenades, sites, lots } = build(floor)
  const firstRing = lots.filter((lot) => gap(lot, claim) === CLAIM_SETBACK_M)

  it('keeps every site that has room, as it was sited, with no owner of its own', () => {
    expect(lots).toHaveLength(Math.min(sites.length, BUILDING_CAP.full))
    const sited = new Map(sites.map((site) => [site.id, site]))
    for (const lot of lots) {
      expect(lot).toMatchObject(sited.get(lot.id) ?? {})
      expect(lot.zoneId).toBeNull()
    }
  })

  const envelope = {
    ...claim,
    width: claim.width - MIN_BELT_M * 2,
    depth: claim.depth - MIN_BELT_M * 2
  }
  const ordinary = lots.filter((lot) => !lot.isLandmark)

  it('holds every lot under the envelope and its zone: no lot may hide a desk', () => {
    for (const lot of lots) {
      expect(lot.maxHeight).toBeLessThanOrEqual(24)
      expect(lot.maxHeight).toBeLessThanOrEqual(zoneHeightCap(lot.zone, lot.isFarRing))
      if (!lot.isFarRing) expect(lot.maxHeight).toBeLessThanOrEqual(ZONE_HEIGHT_CAP_M[lot.zone])
      expect(lot.maxHeight).toBeLessThanOrEqual(gap(lot, envelope) * HEIGHT_PER_METRE + 1e-9)
      expect(lot.kind).toBe(lot.maxHeight >= 2 ? 'building' : 'prop')
      expect(lot.maxHeight).toBeGreaterThanOrEqual(0.4)
    }
  })

  it('gives every lot but a landmark exactly the room the promenades leave it', () => {
    for (const lot of ordinary) {
      // Only a park's own lots stand in a promenade: they are measured against the others.
      const others = promenades.filter((walk) => !overlapping(lot, walk))
      if (others.length < promenades.length) expect(lot.zone).toBe('park')
      const clear = Math.min(gap(lot, envelope), ...others.map((walk) => gap(lot, walk)))
      expect(lot.maxHeight).toBeCloseTo(
        Math.min(zoneHeightCap(lot.zone, lot.isFarRing), clear * HEIGHT_PER_METRE),
        9
      )
    }
  })

  it('keeps the first ring and the avenue low, so the promenades are seen', () => {
    for (const lot of ordinary.filter((each) => firstRing.includes(each)))
      expect(lot.maxHeight).toBeLessThanOrEqual(6.65 + 1e-9)
    for (const lot of ordinary.filter((each) => each.frontage === 'avenue'))
      expect(lot.maxHeight).toBeLessThanOrEqual(3.15 + 1e-9)
  })

  // The design aims at twice on the median. Parks, one block in eight, hold the lots round them
  // low so their walkers are seen, and that keeps the median near 1.8 times.
  it('rises outward: the far ring stands well above the first ring', () => {
    const far = lots.filter((lot) => lot.isFarRing).map((lot) => lot.maxHeight)
    const low = median(firstRing.map((lot) => lot.maxHeight))
    expect(firstRing.length).toBeGreaterThan(0)
    expect(median(far)).toBeGreaterThanOrEqual(1.5 * low)
    const tallestQuarter = [...far].sort((a, b) => b - a).slice(0, Math.floor(far.length / 4))
    expect(Math.min(...tallestQuarter)).toBeGreaterThanOrEqual(2.5 * low)
  })

  it('calls a lot far ring when it is not within 24 m of the claim', () => {
    const near = fromEdges({
      west: edges(claim).west - FAR_RING_FROM_M,
      east: edges(claim).east + FAR_RING_FROM_M,
      north: edges(claim).north - FAR_RING_FROM_M,
      south: edges(claim).south + FAR_RING_FROM_M
    })
    for (const lot of lots) expect(lot.isFarRing).toBe(!overlapping(lot, near))
  })

  // What a landmark may reach: the offices and its zone bound it, a promenade does not.
  const landmarkRoom = (lot: (typeof lots)[number]): number =>
    Math.min(zoneHeightCap(lot.zone, lot.isFarRing), gap(lot, envelope) * HEIGHT_PER_METRE)

  it('marks one landmark in civic, entertainment and workshop, and none elsewhere', () => {
    for (const zone of TOWN_DISTRICTS) {
      const landmarks = lots.filter((lot) => lot.zone === zone && lot.isLandmark)
      expect(landmarks).toHaveLength(LANDMARK_ZONES.includes(zone) ? 1 : 0)
    }
    expect(lots.filter((lot) => lot.kind === 'prop' && lot.isLandmark)).toEqual([])
  })

  it('lets a landmark stand tall: at least 12 m, whatever walk it overlooks', () => {
    for (const lot of lots.filter((each) => each.isLandmark)) {
      expect(lot.maxHeight).toBeCloseTo(landmarkRoom(lot), 9)
      expect(lot.maxHeight).toBeGreaterThanOrEqual(12)
    }
  })

  it('stands the landmark where its zone has the most room, the old town first', () => {
    for (const zone of LANDMARK_ZONES) {
      const inZone = lots.filter((lot) => lot.zone === zone && lot.kind === 'building')
      const most = Math.max(...inZone.map(landmarkRoom))
      const roomiest = inZone.filter((lot) => landmarkRoom(lot) === most)
      // The old town's lots come first, so its landmarks stay put while the campus grows.
      const oldTown = roomiest.filter((lot) => lot.x < edges(claim).west)
      const candidates = oldTown.length > 0 ? oldTown : roomiest
      const [landmark] = inZone.filter((lot) => lot.isLandmark)
      expect(landmark.seed).toBe(Math.min(...candidates.map((lot) => lot.seed)))
    }
  })
})

describe('the building cap', () => {
  const full = build(LARGE_FLOOR, 'full').lots

  it.each(['full', 'balanced', 'light'] as const)('holds at %s', (detail) => {
    const buildings = build(LARGE_FLOOR, detail).lots.filter((lot) => lot.kind === 'building')
    expect(buildings.length).toBeLessThanOrEqual(BUILDING_CAP[detail])
  })

  it('is reached on the largest floor, so the rule is exercised', () => {
    expect(full.filter((lot) => lot.kind === 'building')).toHaveLength(BUILDING_CAP.full)
  })

  it.each(['balanced', 'light'] as const)('drops only far-ring lots at %s', (detail) => {
    const kept = build(LARGE_FLOOR, detail).lots
    const near = full.filter((lot) => !lot.isFarRing)
    expect(near.length).toBeGreaterThan(0)
    for (const lot of near) expect(kept.some((each) => each.id === lot.id)).toBe(true)
  })

  it('drops every other far-ring lot first at balanced, in a checkerboard', () => {
    for (const lot of build(LARGE_FLOOR, 'balanced').lots.filter((each) => each.isFarRing))
      expect(Math.abs((lot.column + lot.row) % 2)).toBe(0)
  })
})
