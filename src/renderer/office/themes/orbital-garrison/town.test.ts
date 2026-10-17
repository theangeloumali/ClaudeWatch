import { describe, expect, it } from 'vitest'
import { citizenGeometry } from '../../citizens/figure-parts'
import { STATE_COLOR } from '../../office-palette'
import { dressLot, type ZonePlot } from '../../town/town-dress'
import { TOWN_DISTRICTS } from '../../town/town-zones'
import { LIVE_FLOORS } from '../floors.test-utils'
import { LANDMARK_ZONES, cityLotsOf, everyZoneLots } from '../town-dress.test-utils'
import type { PartSpec } from '../parts'
import { orbitalGarrison } from './index'
import { GARRISON_TOWN } from './town'

const { designs, props, looks, roads, citizens, vehicles } = GARRISON_TOWN
// A colour no part of the theme uses, so a part that carries it took it from the plot.
const ACCENT = '#123456'
const UNIT_SHAPES = ['box', 'cylinder', 'cone', 'sphere']
const SLACK_M = 1e-6

// The box a part stays inside. A tilted part is given the ball round it: more than it needs.
function reachOf(part: PartSpec) {
  const [width, height, depth] = part.size
  const ball = Math.hypot(width, height, depth) / 2
  const [x, y, z] = part.rotation ? [ball, ball, ball] : [width / 2, height / 2, depth / 2]
  return {
    across: Math.abs(part.at[0]) + x,
    along: Math.abs(part.at[2]) + z,
    bottom: part.at[1] - y,
    top: part.at[1] + y
  }
}

function luminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16))
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

it('is the theme’s town', () => {
  expect(orbitalGarrison.town).toBe(GARRISON_TOWN)
})

describe('the designs', () => {
  it('have their own names and a height range a building lot can give', () => {
    expect(new Set(designs.map((design) => design.name)).size).toBe(designs.length)
    for (const design of designs) {
      expect(design.zones.length).toBeGreaterThan(0)
      expect(design.height.min).toBeGreaterThanOrEqual(2)
      expect(design.height.max).toBeGreaterThan(design.height.min)
      expect(design.height.max).toBeLessThanOrEqual(24)
    }
  })

  it.each(TOWN_DISTRICTS)('give %s at least two, and one for its lowest lots', (zone) => {
    const inZone = designs.filter((design) => design.zones.includes(zone))
    expect(inZone.length).toBeGreaterThanOrEqual(2)
    // A building lot has 2.5 m of room at the least: something ordinary must fit it.
    const lowest = inZone.filter((design) => !design.isLandmark && design.height.min <= 2.5)
    expect(lowest.length).toBeGreaterThanOrEqual(1)
  })

  it.each(LANDMARK_ZONES)('give %s a landmark that fits the 12 m a landmark lot has', (zone) => {
    const landmarks = designs.filter((design) => design.isLandmark && design.zones.includes(zone))
    expect(landmarks.length).toBeGreaterThanOrEqual(1)
    for (const landmark of landmarks) expect(landmark.height.min).toBeLessThanOrEqual(12)
  })

  it('draw a landmark only for the zones a town marks one in', () => {
    for (const design of designs.filter((each) => each.isLandmark))
      for (const zone of design.zones) expect(LANDMARK_ZONES).toContain(zone)
  })

  const plots = designs.flatMap((design) =>
    [
      [8, 8],
      [8, 5]
    ].flatMap(([width, depth]) =>
      [design.height.min, design.height.max].flatMap((height) =>
        [7, 2654435761, 4027431295].map((seed) => ({ design, width, depth, height, seed }))
      )
    )
  )

  it.each(plots)(
    '$design.name on $width x $depth m at $height m stays on its plot',
    ({ design, ...plot }) => {
      const parts = design.build({ ...plot, accent: ACCENT } satisfies ZonePlot)
      expect(parts.length).toBeGreaterThan(0)
      for (const part of parts) {
        expect(UNIT_SHAPES).toContain(part.shape)
        for (const side of part.size) expect(side).toBeGreaterThan(0)
        const reach = reachOf(part)
        expect(reach.across).toBeLessThanOrEqual(plot.width / 2 + SLACK_M)
        expect(reach.along).toBeLessThanOrEqual(plot.depth / 2 + SLACK_M)
        expect(reach.bottom).toBeGreaterThanOrEqual(-SLACK_M)
        expect(reach.top).toBeLessThanOrEqual(plot.height + SLACK_M)
      }
      expect(parts.some((part) => part.color === ACCENT)).toBe(true)
      // Not a slab: it stands at least a metre, and reaches most of the way to its roof at min.
      expect(Math.max(...parts.map((part) => reachOf(part).top))).toBeGreaterThan(1)
    }
  )

  it('build the same thing for the same plot', () => {
    for (const design of designs) {
      const plot = { width: 8, depth: 8, height: design.height.max, seed: 99, accent: ACCENT }
      expect(design.build(plot)).toEqual(design.build(plot))
    }
  })
})

describe('the zone looks', () => {
  const accents = TOWN_DISTRICTS.map((zone) => looks[zone].accent.toLowerCase())
  const grounds = TOWN_DISTRICTS.map((zone) => looks[zone].ground.toLowerCase())

  it('tell six zones apart by roof and by ground', () => {
    expect(new Set(accents).size).toBe(6)
    expect(new Set(grounds).size).toBe(6)
    for (const color of [...accents, ...grounds]) expect(color).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('keep the status colours for status', () => {
    const reserved = Object.values(STATE_COLOR).map((color) => color.toLowerCase())
    for (const color of [...accents, ...grounds, ...Object.values(roads)])
      expect(reserved).not.toContain(color.toLowerCase())
  })

  it('lay a roof that reads against its own ground', () => {
    for (const zone of TOWN_DISTRICTS)
      expect(luminance(looks[zone].accent) - luminance(looks[zone].ground)).toBeGreaterThan(40)
  })

  it('pave a dark carriageway, a mid sidewalk and a light promenade', () => {
    expect(luminance(roads.carriageway)).toBeLessThan(60)
    expect(luminance(roads.sidewalk)).toBeGreaterThan(luminance(roads.carriageway) + 40)
    expect(luminance(roads.promenade)).toBeGreaterThan(luminance(roads.sidewalk) + 60)
  })
})

describe('the props', () => {
  it('are at least eight, each with its own name, and every zone has one', () => {
    expect(props.length).toBeGreaterThanOrEqual(8)
    expect(new Set(props.map((prop) => prop.name)).size).toBe(props.length)
    for (const zone of TOWN_DISTRICTS)
      expect(props.some((prop) => prop.zones.includes(zone))).toBe(true)
  })

  it('stand on the ground inside the size they declare', () => {
    for (const prop of props) {
      const [length, height, reach] = prop.size
      expect(prop.parts.length).toBeGreaterThan(0)
      for (const part of prop.parts) {
        expect(UNIT_SHAPES).toContain(part.shape)
        const box = reachOf(part)
        expect(box.across).toBeLessThanOrEqual(length / 2 + SLACK_M)
        expect(box.along).toBeLessThanOrEqual(reach / 2 + SLACK_M)
        expect(box.bottom).toBeGreaterThanOrEqual(-SLACK_M)
        expect(box.top).toBeLessThanOrEqual(height + SLACK_M)
      }
    }
  })
})

describe('the movers', () => {
  it('walk at least four kinds of citizen', () => {
    expect(citizens.length).toBeGreaterThanOrEqual(4)
    expect(new Set(citizens.map((citizen) => citizen.name)).size).toBe(citizens.length)
  })

  it('run one vehicle for each role', () => {
    expect(vehicles.map((vehicle) => vehicle.role).sort()).toEqual([
      'freight',
      'runabout',
      'transit'
    ])
    expect(new Set(vehicles.map((vehicle) => vehicle.name)).size).toBe(3)
  })

  it.each(vehicles)('$name is one figure on the ground, between 1 and 1.9 m tall', (vehicle) => {
    const boxes = vehicle.parts().map(({ geometry }) => {
      geometry.computeBoundingBox()
      return geometry.boundingBox
    })
    const top = Math.max(...boxes.map((box) => box?.max.y ?? 0))
    const bottom = Math.min(...boxes.map((box) => box?.min.y ?? 0))
    expect(bottom).toBeGreaterThanOrEqual(-SLACK_M)
    expect(bottom).toBeLessThan(0.1)
    expect(top).toBeGreaterThanOrEqual(1)
    expect(top).toBeLessThanOrEqual(1.9)
    // Longer than it is wide, so it reads as heading along +z.
    const length = Math.max(...boxes.map((box) => box?.max.z ?? 0)) * 2
    const width = Math.max(...boxes.map((box) => box?.max.x ?? 0)) * 2
    expect(length).toBeGreaterThan(width)
    const merged = citizenGeometry(vehicle)
    expect(merged.getAttribute('color').count).toBe(merged.getAttribute('position').count)
    merged.dispose()
  })
})

describe.each(LIVE_FLOORS)('dressed over a real plan: %s', (_name, floor) => {
  const cityLots = cityLotsOf(floor)
  const lots = [...cityLots, ...everyZoneLots()]

  it('stands something on every lot, under its limit', () => {
    expect(cityLots.length).toBeGreaterThan(0)
    for (const lot of lots) {
      // Every city lot stands on the ground at 0, as dressCityDistrict stands it.
      const base = 0
      const placed = dressLot(lot, base, GARRISON_TOWN)
      expect(placed.parts.length).toBeGreaterThan(0)
      const top = Math.max(...placed.parts.map((part) => reachOf(part).top)) * placed.scale
      expect(base + top).toBeLessThanOrEqual(lot.maxHeight + SLACK_M)
    }
  })

  it('has a lot that every design fits: none is drawn for nothing', () => {
    for (const design of designs) {
      const fits = lots.filter(
        (lot) =>
          lot.kind === 'building' &&
          design.zones.includes(lot.zone) &&
          lot.isLandmark === (design.isLandmark === true) &&
          lot.maxHeight >= design.height.min
      )
      expect(fits.length, design.name).toBeGreaterThan(0)
    }
  })

  it('uses most of its designs on any one floor', () => {
    const used = new Set(lots.map((lot) => dressLot(lot, -0.5, GARRISON_TOWN).design))
    expect(used.size).toBeGreaterThanOrEqual(designs.length - 2)
  })

  it('stands each landmark on its zone’s landmark lot', () => {
    for (const lot of lots.filter((each) => each.isLandmark)) {
      const design = designs.find((each) => each.name === dressLot(lot, -0.5, GARRISON_TOWN).design)
      expect(design?.isLandmark).toBe(true)
      expect(design?.zones).toContain(lot.zone)
    }
  })
})
