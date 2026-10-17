import { Color } from 'three'
import { describe, expect, it } from 'vitest'
import { boundsOfZone } from '../logic/zone-framing'
import type { PlacedLot } from '../themes/lot-kit'
import { listThemes } from '../themes/registry'
import { GROUND_Y } from '../themes/surroundings'
import { LIVE_FLOORS } from '../themes/floors.test-utils'
import { distributedTown } from './distributed-town'
import { fallbackDress } from './fallback-dress'
import { dressLot } from './town-dress'
import { TOWN_DISTRICTS } from './town-zones'
import { townOf } from './use-town-plan'

// What production dresses: the city on each live floor's own site.
const lots = LIVE_FLOORS.flatMap(
  ([, floor]) => distributedTown(townOf(floor, null), [floor]).plan.lots
)
// The city lays no park lot; parks are only the dress's own ground.
const CITY_DISTRICTS = TOWN_DISTRICTS.filter((zone) => zone !== 'park')
const EDGE = 1e-6

// The box round everything that stands on a lot, in floor metres.
function standing(placed: PlacedLot) {
  const isSideways = Math.abs(Math.sin(placed.turn)) > 0.5
  const [x, base, z] = placed.at
  const reach = { along: 0, across: 0, top: 0, bottom: Infinity }
  for (const part of placed.parts) {
    reach.along = Math.max(reach.along, Math.abs(part.at[0]) + part.size[0] / 2)
    reach.across = Math.max(reach.across, Math.abs(part.at[2]) + part.size[2] / 2)
    reach.top = Math.max(reach.top, part.at[1] + part.size[1] / 2)
    reach.bottom = Math.min(reach.bottom, part.at[1] - part.size[1] / 2)
  }
  const halfWidth = (isSideways ? reach.across : reach.along) * placed.scale
  const halfDepth = (isSideways ? reach.along : reach.across) * placed.scale
  return {
    top: base + reach.top * placed.scale,
    bottom: base + reach.bottom * placed.scale,
    minX: x - halfWidth,
    maxX: x + halfWidth,
    minZ: z - halfDepth,
    maxZ: z + halfDepth
  }
}

const luminance = (hex: string): number => {
  const { r, g, b } = new Color(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe.each(listThemes().map((theme) => [theme.id, theme.palette] as const))(
  'fallbackDress from the %s palette',
  (_id, palette) => {
    const dress = fallbackDress(palette)

    it('has a design and a prop of its own for every zone', () => {
      for (const zone of TOWN_DISTRICTS) {
        expect(
          dress.designs.some((design) => design.zones.includes(zone)),
          zone
        ).toBe(true)
        expect(
          dress.props.some((prop) => prop.zones.includes(zone)),
          zone
        ).toBe(true)
      }
    })

    it('fills every lot of the city inside its footprint and under its height', () => {
      const dressed = new Set<string>()
      for (const lot of lots) {
        const placed = dressLot(lot, GROUND_Y, dress)
        expect(placed.parts.length, lot.id).toBeGreaterThan(0)
        const box = standing(placed)
        const ground = boundsOfZone(lot)
        expect(box.top, `${lot.id} ${placed.design} top`).toBeLessThanOrEqual(lot.maxHeight + EDGE)
        expect(box.bottom, `${lot.id} ${placed.design} foot`).toBeGreaterThanOrEqual(
          GROUND_Y - EDGE
        )
        expect(box.minX, `${lot.id} ${placed.design}`).toBeGreaterThanOrEqual(ground.minX - EDGE)
        expect(box.maxX, `${lot.id} ${placed.design}`).toBeLessThanOrEqual(ground.maxX + EDGE)
        expect(box.minZ, `${lot.id} ${placed.design}`).toBeGreaterThanOrEqual(ground.minZ - EDGE)
        expect(box.maxZ, `${lot.id} ${placed.design}`).toBeLessThanOrEqual(ground.maxZ + EDGE)
        dressed.add(lot.zone)
      }
      expect([...dressed].sort()).toEqual([...CITY_DISTRICTS].sort())
    })

    it('roofs each zone in that zone’s accent', () => {
      for (const zone of CITY_DISTRICTS) {
        const lot = lots.find((each) => each.zone === zone && each.kind === 'building')
        if (!lot) throw new Error(`the city has no ${zone} building`)
        const colours = dressLot(lot, GROUND_Y, dress).parts.map((part) => part.color)
        expect(colours, zone).toContain(dress.looks[zone].accent)
      }
    })

    it('gives every zone a ground of its own', () => {
      const grounds = TOWN_DISTRICTS.map((zone) => dress.looks[zone].ground)
      expect(new Set(grounds).size).toBe(TOWN_DISTRICTS.length)
    })

    it('makes roads darker than every pad and promenades lighter than both', () => {
      const pads = TOWN_DISTRICTS.map((zone) => luminance(dress.looks[zone].ground))
      expect(luminance(dress.roads.carriageway)).toBeLessThan(Math.min(...pads))
      expect(luminance(dress.roads.promenade)).toBeGreaterThan(Math.max(...pads))
      expect(luminance(dress.roads.sidewalk)).toBeGreaterThan(luminance(dress.roads.carriageway))
    })

    it('is the same dress for the same palette', () => {
      expect(fallbackDress(palette)).toBe(dress)
    })
  }
)
