import { describe, expect, it } from 'vitest'
import { citizenGeometry } from '../citizens/figure-parts'
import type { FloorGeometry } from '../scene-model'
import { distributedTown } from '../town/distributed-town'
import { dressLot, type DressableLot, type TownDress } from '../town/town-dress'
import { LANDMARK_DISTRICTS, TOWN_DISTRICTS, type TownDistrict } from '../town/town-zones'
import { townOf } from '../town/use-town-plan'
import { LIVE_FLOORS } from './floors.test-utils'
import { expectInsideLot } from './lot-box.test-utils'
import type { OfficeTheme } from './types'
import { UNIT_SHAPES } from './unit-parts'
import {
  boundsOf,
  EPSILON,
  expectOnItsPlot,
  GROUND_SLACK_M,
  HEX,
  luminance,
  sizeOf,
  TEST_ACCENT
} from './town-bounds.test-utils'

export { heightOf } from './town-bounds.test-utils'

export const LANDMARK_ZONES = LANDMARK_DISTRICTS
const BUILDING_HEIGHTS_M = [4, 8, 12, 24]
const LANDMARK_HEIGHTS_M = [12, 24]
const SEEDS_PER_HEIGHT = 4
// A town lot, and an avenue lot seen from its front and from its side.
const FOOTPRINTS = [
  { width: 8, depth: 8 },
  { width: 8, depth: 5 },
  { width: 5, depth: 8 }
]
// A small park plot, which only park designs are stood on.
const GREEN_FOOTPRINT = { width: 4, depth: 4 }
const WIDE_PLOT = { width: 8, depth: 8, seed: 7, accent: TEST_ACCENT }

function zoneLot(
  zone: TownDistrict,
  kind: DressableLot['kind'],
  maxHeight: number,
  seed: number,
  isLandmark: boolean
): DressableLot {
  const id = `${zone}:${kind}:${isLandmark ? 'landmark' : 'plain'}:${maxHeight}:${seed}`
  return {
    id,
    kind,
    x: 0,
    z: 0,
    width: 8,
    depth: 8,
    maxHeight,
    seed,
    zone,
    facing: 'south',
    isLandmark
  }
}

// Lots of every zone and landmark at every height: the city makes only some of them, and every
// design must keep a lot to stand on.
export function everyZoneLots(): DressableLot[] {
  const seeds = Array.from({ length: SEEDS_PER_HEIGHT }, (_, seed) => seed)
  return TOWN_DISTRICTS.flatMap((zone) => [
    ...seeds.map((seed) => zoneLot(zone, 'prop', 1.5, seed, false)),
    ...BUILDING_HEIGHTS_M.flatMap((height) =>
      seeds.map((seed) => zoneLot(zone, 'building', height, seed, false))
    ),
    ...(LANDMARK_ZONES.includes(zone)
      ? LANDMARK_HEIGHTS_M.flatMap((height) =>
          seeds.map((seed) => zoneLot(zone, 'building', height, seed, true))
        )
      : [])
  ])
}

// The city round a floor's own site, as the scene lays it on a first start.
export const cityLotsOf = (floor: FloorGeometry): DressableLot[] =>
  distributedTown(townOf(floor, null), [floor]).plan.lots

// What every theme's town dress must hold to, whatever it looks like.
export function describeTownDress(theme: OfficeTheme, dress: TownDress): void {
  describe(`the town dress of ${theme.label}`, () => {
    it('is the town its theme is registered with', () => {
      expect(theme.town).toBe(dress)
    })

    it('has at least two designs for every zone, each with its own name', () => {
      for (const zone of TOWN_DISTRICTS) {
        const ofZone = dress.designs.filter((design) => design.zones.includes(zone))
        expect(ofZone.length, zone).toBeGreaterThanOrEqual(2)
      }
      const names = dress.designs.map((design) => design.name)
      expect(new Set(names).size).toBe(names.length)
    })

    it('has one landmark each for the civic, workshop and entertainment zones', () => {
      for (const zone of LANDMARK_ZONES) {
        const landmarks = dress.designs.filter(
          (design) => design.isLandmark && design.zones.includes(zone)
        )
        expect(landmarks.length, zone).toBe(1)
      }
    })

    it.each(dress.designs.map((design) => [design.name, design] as const))(
      'builds %s on its plot, under its height and on the ground',
      (_name, design) => {
        const footprints = design.zones.includes('park')
          ? [...FOOTPRINTS, GREEN_FOOTPRINT]
          : FOOTPRINTS
        expect(design.height.min).toBeLessThanOrEqual(design.height.max)
        for (const footprint of footprints)
          for (const height of [design.height.min, design.height.max])
            expectOnItsPlot(design, { ...footprint, height, seed: 7, accent: TEST_ACCENT })
      }
    )

    it('paints some part of every design with the accent of its zone', () => {
      for (const design of dress.designs) {
        const parts = design.build({ ...WIDE_PLOT, height: design.height.max })
        const isPainted = parts.some((part) => part.color === TEST_ACCENT)
        expect(isPainted, design.name).toBe(true)
      }
    })

    it('paints a building with the accent where it is seen from above', () => {
      for (const design of dress.designs.filter((each) => !each.zones.includes('park'))) {
        const height = design.height.max
        const painted = design
          .build({ ...WIDE_PLOT, height })
          .filter((part) => part.color === TEST_ACCENT)
        const highest = Math.max(...painted.map((part) => boundsOf(part).max.y))
        expect(highest, design.name).toBeGreaterThan(height * 0.5)
      }
    })

    it('tells the six zones apart by roof colour and by ground tint', () => {
      const looks = TOWN_DISTRICTS.map((zone) => dress.looks[zone])
      for (const key of ['accent', 'ground'] as const) {
        const colors = looks.map((look) => look[key].toUpperCase())
        for (const color of colors) expect(color).toMatch(HEX)
        expect(new Set(colors).size, key).toBe(TOWN_DISTRICTS.length)
      }
    })

    it('lays a dark carriageway, a mid sidewalk and a light promenade', () => {
      const { carriageway, sidewalk, promenade } = dress.roads
      expect(luminance(carriageway)).toBeLessThan(luminance(sidewalk))
      expect(luminance(sidewalk)).toBeLessThan(luminance(promenade))
      // A figure is dark cloth and pale skin: it needs a walk much lighter than the road.
      expect(luminance(promenade) - luminance(carriageway)).toBeGreaterThan(0.3)
    })

    it('has at least eight props, each for a zone, and one for every zone', () => {
      expect(dress.props.length).toBeGreaterThanOrEqual(8)
      expect(new Set(dress.props.map((prop) => prop.name)).size).toBe(dress.props.length)
      for (const prop of dress.props) {
        expect(prop.zones.length, prop.name).toBeGreaterThan(0)
        expect(prop.parts.length, prop.name).toBeGreaterThan(0)
        for (const part of prop.parts) expect(Object.keys(UNIT_SHAPES)).toContain(part.shape)
      }
      for (const zone of TOWN_DISTRICTS) {
        const hasProp = dress.props.some((prop) => prop.zones.includes(zone))
        expect(hasProp, zone).toBe(true)
      }
    })

    it('has at least four citizens and one vehicle for each role', () => {
      expect(dress.citizens.length).toBeGreaterThanOrEqual(4)
      expect(dress.vehicles.map((vehicle) => vehicle.role).sort()).toEqual([
        'freight',
        'runabout',
        'transit'
      ])
      const names = [...dress.citizens, ...dress.vehicles].map((figure) => figure.name)
      expect(new Set(names).size).toBe(names.length)
    })

    it.each(dress.vehicles.map((vehicle) => [vehicle.name, vehicle] as const))(
      'draws %s as one merged figure, on the ground, longer than it is wide',
      (_name, vehicle) => {
        const geometry = citizenGeometry(vehicle)
        const positions = geometry.getAttribute('position')
        expect(geometry.getAttribute('color').count).toBe(positions.count)
        geometry.dispose()
        const { min, max } = sizeOf(vehicle)
        expect(min.y).toBeGreaterThan(-EPSILON)
        expect(min.y).toBeLessThan(GROUND_SLACK_M)
        expect(max.y).toBeGreaterThanOrEqual(0.9)
        expect(max.y).toBeLessThanOrEqual(2.1)
        expect(max.z - min.z).toBeGreaterThan(max.x - min.x)
        // At the citizens' scale it must keep to one lane of a 6 m collector.
        expect(max.x - min.x).toBeLessThanOrEqual(1.6)
      }
    )

    describe.each(LIVE_FLOORS)('on the town of %s', (_name, floor) => {
      const cityLots = cityLotsOf(floor)
      const lots = [...cityLots, ...everyZoneLots()]

      it('dresses every lot, inside its footprint and under its height limit', () => {
        expect(cityLots.length).toBeGreaterThan(0)
        for (const lot of lots) expectInsideLot(dressLot(lot, 0, dress))
      })

      it('never squashes a building under the height it looks right at', () => {
        for (const lot of lots.filter((each) => each.kind === 'building')) {
          const placed = dressLot(lot, 0, dress)
          const design = dress.designs.find((each) => each.name === placed.design)
          const where = `${placed.design} on ${lot.id}`
          expect(design?.height.min, where).toBeLessThanOrEqual(lot.maxHeight)
          expect(design?.zones, where).toContain(lot.zone)
        }
      })

      it('stands its landmarks on the landmark lots', () => {
        for (const zone of LANDMARK_ZONES) {
          const lot = lots.find((each) => each.isLandmark && each.zone === zone)
          const placed = lot && dressLot(lot, 0, dress)
          const design = dress.designs.find((each) => each.name === placed?.design)
          expect(design?.isLandmark, zone).toBe(true)
        }
      })
    })
  })
}
