import { expect, it } from 'vitest'
import { townOf } from '../../town/use-town-plan'
import { makeFloor } from '../fixtures'
import { distributedTown } from '../../town/distributed-town'
import { overlaps } from '../../themes/lot-math'
import { groundQuads } from '../../town/town-ground'
import { plazaSquare } from '../../town/town-plaza'
import { fallbackDress } from '../../town/fallback-dress'
import { EDO } from '../../themes/palettes'
import { cityScenerySites } from '../../../../shared/office/city-scenery'
import { CITY_FRONTAGE_SETBACK_METRES } from '../../../../shared/office/city-block-layout'

it('places scenery and traversable streets inside the city without covering live buildings', () => {
  const envelope = makeFloor({ floorId: 'city-envelope', x: 0, z: 0, width: 150, depth: 150 })
  const buildings = [
    { x: 0, z: -48, width: 30, depth: 25 },
    { x: 48, z: 0, width: 30, depth: 25 }
  ]
  const town = distributedTown(townOf(envelope, null, 'full'), buildings)
  const lots = town.plan.lots.filter((lot) => lot.id.startsWith('city-lot:'))
  const sites = cityScenerySites(buildings)
  expect(lots.length).toBeGreaterThan(0)
  expect(lots.map(({ id, x, z, width, depth }) => ({ id, x, z, width, depth }))).toEqual(
    sites.map(({ id, x, z, width, depth }) => ({ id, x, z, width, depth }))
  )
  for (const lot of lots) {
    expect(lot.width).toBeGreaterThan(0)
    expect(lot.depth).toBeGreaterThan(0)
    for (const building of buildings)
      expect(
        overlaps(lot, {
          ...building,
          width: building.width + CITY_FRONTAGE_SETBACK_METRES * 2,
          depth: building.depth + CITY_FRONTAGE_SETBACK_METRES * 2
        })
      ).toBe(false)
    for (const other of lots) if (other !== lot) expect(overlaps(lot, other)).toBe(false)
    for (const road of town.plan.roads) {
      const footprint = {
        x: (road.from.x + road.to.x) / 2,
        z: (road.from.z + road.to.z) / 2,
        width: Math.abs(road.to.x - road.from.x) || road.width,
        depth: Math.abs(road.to.z - road.from.z) || road.width
      }
      expect(overlaps(lot, footprint)).toBe(false)
    }
  }
  expect(town.plan.roads.some((road) => road.id.startsWith('city-street:'))).toBe(true)
  expect(town.plan.graph.edges.length).toBeGreaterThan(0)
  expect(
    town.plan.lots.every((lot) => buildings.every((building) => !overlaps(lot, building)))
  ).toBe(true)
  expect(
    town.plan.graph.nodes.every((point) => Number.isFinite(point.x) && Number.isFinite(point.z))
  ).toBe(true)
})

it('does not paint the old headquarters avenue and gate plaza across distributed offices', () => {
  const envelope = makeFloor({ floorId: 'district', x: 0, z: 0, width: 150, depth: 150 })
  const sites = [{ x: 48, z: 0, width: 30, depth: 25 }]
  const district = distributedTown(townOf(envelope, null, 'full'), sites)
  const quads = groundQuads(district.plan, fallbackDress(EDO))
  const plaza = plazaSquare(district.plan.claim)
  expect(quads.filter((quad) => quad.layer === 'street')).toEqual([])
  expect(
    quads.some(
      (quad) =>
        quad.layer === 'promenade' &&
        quad.x === plaza.x &&
        quad.z === plaza.z &&
        quad.width === plaza.width &&
        quad.depth === plaza.depth
    )
  ).toBe(false)
})

it('retains the entrance plaza for an actual legacy single-campus town', () => {
  const legacy = townOf(makeFloor({ floorId: 'hq' }), null, 'full')
  const quads = groundQuads(legacy.plan, fallbackDress(EDO))
  expect(quads.filter((quad) => quad.layer === 'street')).toHaveLength(1)
  expect(quads.some((quad) => quad.layer === 'promenade')).toBe(true)
})
