import { Box3 } from 'three'
import { describe, expect, it } from 'vitest'
import { citizenGeometry } from '../../citizens/figure-parts'
import { buildCorporateTower, CorporateTower } from '../../themes/corporate-city/CorporateTower'
import {
  CORPORATE_MATERIALS,
  CORPORATE_PALETTE,
  HUMAN_CLOTHING_COLORS,
  HUMAN_HAIR_COLORS,
  HUMAN_SKIN_TONES
} from '../../themes/corporate-city/palette'
import { CORPORATE_TOWN } from '../../themes/corporate-city/town'
import { expectInsideLot } from '../../themes/lot-box.test-utils'
import type { PartSpec } from '../../themes/parts'
import { boundsOf, EPSILON, expectOnItsPlot, sizeOf } from '../../themes/town-bounds.test-utils'
import type { TowerProps } from '../../themes/types'
import { UNIT_SHAPES } from '../../themes/unit-parts'
import { dressLot, type DressableLot } from '../../town/town-dress'
import { planTown } from '../../town/town-plan'
import { GARDEN_TREE } from '../../town/garden-pieces'
import { LONE_FLOOR } from '../../town/town.test-utils'

const ZONES = ['civic', 'market', 'entertainment', 'residential', 'workshop', 'park'] as const
const FACINGS = ['north', 'east', 'south', 'west'] as const
const COLORS = new Set([
  ...Object.values(CORPORATE_PALETTE),
  ...Object.values(CORPORATE_MATERIALS),
  ...HUMAN_CLOTHING_COLORS,
  ...HUMAN_HAIR_COLORS,
  ...HUMAN_SKIN_TONES
])
const FOOTPRINTS = [
  { width: 8, depth: 5 },
  { width: 5, depth: 8 },
  { width: 0.9, depth: 6 },
  { width: 6, depth: 1.1 }
]

function boundsOfAll(parts: readonly PartSpec[]): Box3 {
  return parts.reduce((bounds, part) => bounds.union(boundsOf(part)), new Box3())
}

function towerProps(count: number): TowerProps {
  return {
    floors: Array.from({ length: count }, (_, index) => ({
      floorId: `floor-${index}`,
      label: `Office ${index}`,
      attentionCount: index % 2,
      agentCount: index + 1
    }))
  }
}

describe('Corporate City town assets', () => {
  it('covers all six zones with distinct ordinary silhouettes and the three civic landmarks', () => {
    expect(Object.keys(CORPORATE_TOWN.looks).sort()).toEqual([...ZONES].sort())
    for (const zone of ZONES) {
      const ordinary = CORPORATE_TOWN.designs.filter(
        (design) => design.zones.includes(zone) && !design.isLandmark
      )
      expect(ordinary.length, zone).toBeGreaterThanOrEqual(2)
      const silhouettes = ordinary.map((design) =>
        design
          .build({ width: 8, depth: 6, height: 6, seed: 17, accent: CORPORATE_MATERIALS.civic })
          .filter((part) => part.shape === 'box' && part.size[1] > 1)
          .map(({ at, size }) => ({ at, size }))
      )
      expect(new Set(silhouettes.map((parts) => JSON.stringify(parts))).size, zone).toBe(
        ordinary.length
      )
    }
    for (const zone of ['civic', 'workshop', 'entertainment'] as const) {
      expect(
        CORPORATE_TOWN.designs.filter((design) => design.isLandmark && design.zones.includes(zone))
      ).toHaveLength(1)
    }
    const names = [...CORPORATE_TOWN.designs, ...CORPORATE_TOWN.props].map(({ name }) => name)
    expect(new Set(names).size).toBe(names.length)
  })

  it.each(CORPORATE_TOWN.designs.map((design) => [design.name, design] as const))(
    'keeps %s bounded even on low plots and narrow frontage',
    (_name, design) => {
      for (const footprint of FOOTPRINTS) {
        for (const height of [0.65, 2, design.height.min, design.height.max]) {
          const plot = { ...footprint, height, seed: 91, accent: CORPORATE_MATERIALS.civic }
          expectOnItsPlot(design, plot)
          const parts = design.build(plot)
          expect(parts, design.name).toEqual(design.build(plot))
          expect(parts.length, design.name).toBeLessThanOrEqual(48)
          expect(
            parts.some((part) => part.color === plot.accent),
            design.name
          ).toBe(true)
          for (const part of parts) expect(COLORS.has(part.color), part.color).toBe(true)
        }
      }
    }
  )

  it.each(FACINGS)('fits all six zones when turned %s on a translated, low lot', (facing) => {
    for (const zone of ZONES) {
      for (const kind of ['building', 'prop'] as const) {
        const lot: DressableLot = {
          id: `tight-${zone}-${facing}-${kind}`,
          kind,
          x: 131.7,
          z: -84.3,
          width: 0.9,
          depth: 4.2,
          maxHeight: 1.95,
          seed: 59,
          zoneId: null,
          zone,
          facing,
          isLandmark: false
        }
        const placed = dressLot(lot, 1.3, CORPORATE_TOWN)
        expectInsideLot(placed)
        expect(placed).toEqual(dressLot(lot, 1.3, CORPORATE_TOWN))
      }
    }
  })

  it.each([
    [0, 0],
    [117.5, -63.25]
  ])('dresses the floor lots translated by (%s, %s) deterministically', (x, z) => {
    const original = planTown(LONE_FLOOR, 'full')
    // Translate the supplied lots, not only the campus center of a gate-anchored planner.
    const plan = {
      ...original,
      lots: original.lots.map((lot) => ({ ...lot, x: lot.x + x, z: lot.z + z }))
    }
    expect(plan.lots.length).toBeGreaterThan(100)
    for (const lot of plan.lots) {
      const placed = dressLot(lot, 0, CORPORATE_TOWN)
      expectInsideLot(placed)
      expect(placed).toEqual(dressLot(lot, 0, CORPORATE_TOWN))
    }
    const landmark = plan.lots.find((lot) => lot.zone === 'civic' && lot.isLandmark)
    expect(landmark).toBeDefined()
    if (!landmark) throw new Error('The campus plan has no civic landmark')
    expectInsideLot({
      lot: landmark,
      key: landmark.id,
      at: [landmark.x, 0, landmark.z],
      turn: 0,
      scale: 1,
      design: 'CorporateTower',
      parts: buildCorporateTower(towerProps(30))
    })
  })

  it('declares honest prop bounds, every garden role and light pedestrian surfaces', () => {
    expect(CORPORATE_TOWN.props.length).toBeGreaterThanOrEqual(8)
    for (const prop of CORPORATE_TOWN.props) {
      const bounds = boundsOfAll(prop.parts)
      expect(bounds.min.y, prop.name).toBeGreaterThanOrEqual(-EPSILON)
      expect(bounds.max.y, prop.name).toBeLessThanOrEqual(prop.size[1] + EPSILON)
      expect(Math.max(Math.abs(bounds.min.x), bounds.max.x)).toBeLessThanOrEqual(prop.size[0] / 2)
      expect(Math.max(Math.abs(bounds.min.z), bounds.max.z)).toBeLessThanOrEqual(prop.size[2] / 2)
      for (const part of prop.parts) {
        expect(Object.keys(UNIT_SHAPES)).toContain(part.shape)
        expect(COLORS.has(part.color)).toBe(true)
      }
    }
    for (const name of Object.values(CORPORATE_TOWN.garden ?? {})) {
      expect(
        name === GARDEN_TREE ||
          [...CORPORATE_TOWN.props, ...CORPORATE_TOWN.designs].some((asset) => asset.name === name)
      ).toBe(true)
    }
    expect(Object.keys(CORPORATE_TOWN.garden ?? {})).toHaveLength(7)
    expect(CORPORATE_TOWN.roads).toEqual({
      carriageway: CORPORATE_MATERIALS.road,
      sidewalk: CORPORATE_MATERIALS.sidewalk,
      promenade: CORPORATE_PALETTE.paper
    })
  })

  it('keeps modern adults and all vehicle roles small, opaque and mergeable', () => {
    expect(CORPORATE_TOWN.citizens.length).toBeGreaterThanOrEqual(4)
    expect(CORPORATE_TOWN.vehicles.map(({ role }) => role).sort()).toEqual([
      'freight',
      'runabout',
      'transit'
    ])
    for (const figure of [...CORPORATE_TOWN.citizens, ...CORPORATE_TOWN.vehicles]) {
      const isVehicle = CORPORATE_TOWN.vehicles.some((vehicle) => vehicle === figure)
      const parts = figure.parts()
      expect(parts.length, figure.name).toBeLessThanOrEqual(isVehicle ? 16 : 10)
      const triangles = parts.reduce(
        (count, { geometry }) =>
          count + (geometry.index?.count ?? geometry.getAttribute('position').count) / 3,
        0
      )
      expect(triangles, figure.name).toBeLessThanOrEqual(isVehicle ? 700 : 550)
      for (const part of parts) {
        expect(COLORS.has(part.color), part.color).toBe(true)
        part.geometry.dispose()
      }
      const geometry = citizenGeometry(figure)
      expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count)
      geometry.dispose()
      const bounds = sizeOf(figure)
      expect(bounds.min.y, figure.name).toBeCloseTo(0, 5)
      expect(bounds.max.y).toBeLessThanOrEqual(isVehicle ? 2.1 : 1.3)
      expect('provider' in figure).toBe(false)
      if (isVehicle) {
        expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(1.6)
        expect(bounds.max.z - bounds.min.z).toBeGreaterThan(bounds.max.x - bounds.min.x)
      } else {
        expect(bounds.max.y).toBeGreaterThan(1)
      }
    }
  })

  it('caps material-shape kinds instead of creating per-building geometry or materials', () => {
    const parts = [
      ...CORPORATE_TOWN.designs.flatMap((design) =>
        design.build({
          width: 8,
          depth: 8,
          height: design.height.max,
          seed: 7,
          accent: CORPORATE_TOWN.looks[design.zones[0]].accent
        })
      ),
      ...CORPORATE_TOWN.props.flatMap((prop) => prop.parts)
    ]
    expect(
      new Set(parts.map((part) => `${part.shape}:${part.color}:${part.glow ?? false}`)).size
    ).toBeLessThanOrEqual(24)
  })

  it('builds a bounded standalone headquarters from the actual TowerProps', () => {
    expect(typeof CorporateTower).toBe('function')
    for (const count of [0, 1, 30]) {
      const props = towerProps(count)
      const before = JSON.stringify(props)
      const parts = buildCorporateTower(props)
      const bounds = boundsOfAll(parts)
      expect(bounds.min.y).toBeCloseTo(0)
      expect(bounds.max.y).toBeLessThanOrEqual(13)
      expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(5)
      expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(5)
      expect(parts.length).toBeLessThanOrEqual(48)
      expect(parts.some((part) => part.color === CORPORATE_MATERIALS.glass)).toBe(true)
      expect(parts.filter((part) => part.shape === 'cone')).toEqual([])
      expect(parts).toEqual(buildCorporateTower(props))
      expect(JSON.stringify(props)).toBe(before)
    }
  })

  it('fits the actual civic lot supplied by the world layer, including a low narrow site', () => {
    const plot = { width: 0.9, depth: 4.2, maxHeight: 0.65 }
    const parts = buildCorporateTower({ ...towerProps(30), plot })
    const bounds = boundsOfAll(parts)
    expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(plot.width)
    expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(plot.depth)
    expect(bounds.max.y).toBeLessThanOrEqual(plot.maxHeight)
  })
})
