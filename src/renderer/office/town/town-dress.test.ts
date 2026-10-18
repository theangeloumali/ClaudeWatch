import { describe, expect, it } from 'vitest'
import { makeFloor } from '../__tests__/fixtures'
import { distributedTown } from './distributed-town'
import { townOf } from './use-town-plan'
import { SIDE_NORMAL, type WallSide } from '../logic/room-layout'
import { draw } from '../themes/lot-math'
import { box } from '../themes/parts'
import {
  dressLot,
  type DressableLot,
  type TownDress,
  type ZoneDesign,
  type ZonePlot,
  type ZoneProp
} from './town-dress'
import { TOWN_DISTRICTS, type TownDistrict } from './town-zones'

const seen: ZonePlot[] = []

function design(
  name: string,
  zones: readonly TownDistrict[],
  min: number,
  max: number,
  isLandmark = false
): ZoneDesign {
  return {
    name,
    zones,
    height: { min, max },
    build: (plot) => {
      seen.push(plot)
      return [box([0, plot.height / 2, 0], [plot.width, plot.height, plot.depth], plot.accent)]
    },
    ...(isLandmark ? { isLandmark: true as const } : {})
  }
}

const prop = (name: string, zones: readonly TownDistrict[], height: number): ZoneProp => ({
  name,
  zones,
  size: [2, height, 1],
  parts: [box([0, height / 2, 0], [2, height, 1], '#111111')]
})

const looks = Object.fromEntries(
  TOWN_DISTRICTS.map((zone, index) => [
    zone,
    { accent: `#0000${index}0`, ground: `#00${index}000` }
  ])
) as TownDress['looks']

function dressOf(designs: readonly ZoneDesign[], props: readonly ZoneProp[] = []): TownDress {
  return {
    designs,
    props,
    looks,
    roads: { carriageway: '#222222', sidewalk: '#888888', promenade: '#DDDDDD' },
    citizens: [],
    vehicles: []
  }
}

function lot(overrides: Partial<DressableLot> = {}): DressableLot {
  return {
    id: 'lot:4:-5',
    kind: 'building',
    x: 54,
    z: -53,
    width: 8,
    depth: 5,
    maxHeight: 12,
    seed: 77,
    zone: 'residential',
    facing: 'south',
    isLandmark: false,
    ...overrides
  }
}

const HOMES = [
  design('cottage', ['residential'], 2, 4),
  design('townhouse', ['residential'], 4, 9),
  design('tenement', ['residential'], 7, 12),
  design('tower block', ['residential'], 10, 18)
]
const SEEDS = Array.from({ length: 200 }, (_, index) => (index + 1) * 2654435761)

describe('dressLot', () => {
  it('stands the design on the lot, on its base', () => {
    const placed = dressLot(lot(), -0.5, dressOf(HOMES))
    expect(placed).toMatchObject({ key: 'lot:4:-5', at: [54, -0.5, -53], scale: 1 })
    expect(placed.parts.length).toBeGreaterThan(0)
  })

  it.each(['north', 'east', 'south', 'west'] as const)('turns the front to face %s', (facing) => {
    const { turn } = dressLot(lot({ facing }), 0, dressOf(HOMES))
    // A design's front is +z; turned about y it must point the way the lot faces.
    expect(Math.sin(turn)).toBeCloseTo(SIDE_NORMAL[facing].x)
    expect(Math.cos(turn)).toBeCloseTo(SIDE_NORMAL[facing].z)
  })

  it.each<[WallSide, number, number]>([
    ['south', 8, 5],
    ['north', 8, 5],
    ['east', 5, 8],
    ['west', 5, 8]
  ])('hands a lot facing %s a plot %i m along its front and %i m deep', (facing, width, depth) => {
    seen.length = 0
    dressLot(lot({ facing }), 0, dressOf(HOMES))
    expect(seen[0]).toMatchObject({ width, depth, seed: 77 })
  })

  it("paints with the zone's accent", () => {
    for (const zone of TOWN_DISTRICTS) {
      seen.length = 0
      dressLot(lot({ zone }), 0, dressOf(HOMES))
      expect(seen[0].accent).toBe(looks[zone].accent)
    }
  })

  it('picks among the designs of the lot’s zone', () => {
    const dress = dressOf([...HOMES, design('foundry', ['workshop'], 2, 12)])
    for (const seed of SEEDS) {
      expect(dressLot(lot({ seed, zone: 'workshop' }), 0, dress).design).toBe('foundry')
      expect(dressLot(lot({ seed }), 0, dress).design).not.toBe('foundry')
    }
  })

  it('falls back to the residential designs for a zone the theme has not drawn', () => {
    const dress = dressOf([...HOMES, design('foundry', ['workshop'], 2, 12)])
    const used = new Set(
      SEEDS.map((seed) => dressLot(lot({ seed, zone: 'market' }), 0, dress).design)
    )
    expect(used.has('foundry')).toBe(false)
    expect(used.size).toBeGreaterThan(1)
  })

  it('falls back to every design when the theme has no residential one either', () => {
    const dress = dressOf([
      design('foundry', ['workshop'], 2, 12),
      design('mill', ['workshop'], 2, 9)
    ])
    const used = new Set(
      SEEDS.map((seed) => dressLot(lot({ seed, zone: 'civic' }), 0, dress).design)
    )
    expect(used).toEqual(new Set(['foundry', 'mill']))
  })

  it('draws nothing, and does not throw, for a theme with no designs at all', () => {
    expect(dressLot(lot(), 0, dressOf([])).parts).toEqual([])
    expect(dressLot(lot({ kind: 'prop', maxHeight: 1 }), 0, dressOf([])).parts).toEqual([])
  })

  it('gives the landmark lot its zone’s landmark, and no other lot', () => {
    const dress = dressOf([...HOMES, design('pagoda', ['civic', 'residential'], 6, 20, true)])
    for (const seed of SEEDS) {
      expect(dressLot(lot({ seed, isLandmark: true }), 0, dress).design).toBe('pagoda')
      expect(dressLot(lot({ seed }), 0, dress).design).not.toBe('pagoda')
      expect(dressLot(lot({ seed, zone: 'market' }), 0, dress).design).not.toBe('pagoda')
    }
  })

  it('gives a landmark lot an ordinary design when the landmark does not fit or is not drawn', () => {
    const dress = dressOf([...HOMES, design('pagoda', ['residential'], 6, 20, true)])
    const low = dressLot(lot({ isLandmark: true, maxHeight: 5 }), 0, dress)
    expect(['cottage', 'townhouse']).toContain(low.design)
    const undrawn = dressLot(lot({ isLandmark: true, zone: 'workshop' }), 0, dressOf(HOMES))
    expect(HOMES.map((each) => each.name)).toContain(undrawn.design)
  })

  it('keeps a lot’s design as its room shrinks, until that design stops fitting', () => {
    const dress = dressOf(HOMES)
    let changes = 0
    for (const seed of SEEDS) {
      let last = dressLot(lot({ seed, maxHeight: 20 }), 0, dress).design
      for (let room = 19.5; room >= 2; room -= 0.5) {
        const now = dressLot(lot({ seed, maxHeight: room }), 0, dress).design
        const lastMin = HOMES.find((each) => each.name === last)?.height.min ?? 0
        if (now !== last) {
          changes++
          expect(lastMin).toBeGreaterThan(room)
        }
        expect(HOMES.find((each) => each.name === now)?.height.min).toBeLessThanOrEqual(room)
        last = now
      }
    }
    expect(changes).toBeGreaterThan(SEEDS.length / 2)
  })

  it('spreads the designs over the lots of a zone', () => {
    const used = SEEDS.map(
      (seed) => dressLot(lot({ seed, maxHeight: 20 }), 0, dressOf(HOMES)).design
    )
    for (const home of HOMES)
      expect(used.filter((name) => name === home.name).length).toBeGreaterThan(SEEDS.length / 8)
  })

  it('spreads the designs over the real lots of a zone, whose seeds differ in few bits', () => {
    // Neighbouring lot ids hash to seeds that share their high bits: a six-office city tests it.
    const offices = [
      [0, -48],
      [48, 0],
      [-48, 0],
      [0, 48],
      [96, 48],
      [-96, -48]
    ].map(([x, z]) => ({ x, z, width: 30, depth: 25 }))
    const ground = makeFloor({ floorId: 'city', width: 240, depth: 160 })
    const homes = distributedTown(townOf(ground, null), offices).plan.lots.filter(
      (each) => each.zone === 'residential' && each.kind === 'building'
    )
    expect(homes.length).toBeGreaterThan(20)
    const used = homes.map((home) => dressLot({ ...home, maxHeight: 20 }, 0, dressOf(HOMES)).design)
    for (const home of HOMES)
      expect(used.filter((name) => name === home.name).length).toBeGreaterThan(homes.length / 8)
  })

  it('builds to a seeded height within the design’s range and the room there is', () => {
    for (const seed of SEEDS) {
      seen.length = 0
      const placed = dressLot(lot({ seed, maxHeight: 6 }), -0.5, dressOf(HOMES))
      const { min, max } =
        HOMES.find((each) => each.name === placed.design)?.height ?? HOMES[0].height
      expect(seen[0].height).toBeCloseTo(Math.min(6.5, min + (max - min) * draw(seed, 5)))
      expect(seen[0].height).toBeLessThanOrEqual(6.5)
    }
  })

  it('squeezes the lowest design in when nothing fits', () => {
    seen.length = 0
    expect(dressLot(lot({ maxHeight: 1.5 }), 0, dressOf(HOMES)).design).toBe('cottage')
    expect(seen[0].height).toBe(1.5)
  })

  it('stands a prop on a prop lot, of its zone, shrunk to fit and never enlarged', () => {
    const props = [
      prop('bench', ['park'], 1),
      prop('lamp', ['park'], 3),
      prop('crate', ['workshop'], 1)
    ]
    const dress = dressOf(HOMES, props)
    for (const seed of SEEDS) {
      const low = dressLot(lot({ seed, kind: 'prop', zone: 'park', maxHeight: 1.5 }), 0, dress)
      expect(low).toMatchObject({ design: 'bench', scale: 1 })
      const tall = dressLot(lot({ seed, kind: 'prop', zone: 'park', maxHeight: 3 }), 0, dress)
      expect(['bench', 'lamp']).toContain(tall.design)
    }
    const tight = dressLot(lot({ kind: 'prop', zone: 'park', maxHeight: 0.5 }), 0, dress)
    expect(tight).toMatchObject({ design: 'bench', scale: 0.5 })
    const narrow = dressLot(
      lot({ kind: 'prop', zone: 'workshop', width: 1, maxHeight: 2 }),
      0,
      dress
    )
    expect(narrow).toMatchObject({ design: 'crate', scale: 0.5, turn: 0 })
  })

  it('gives the same lot the same dress every time', () => {
    const dress = dressOf(HOMES)
    expect(dressLot(lot(), 0, dress)).toEqual(dressLot(lot(), 0, dress))
  })
})
