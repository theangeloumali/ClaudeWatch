import { Color } from 'three'
import { describe, expect, it } from 'vitest'
import { citySidewalks } from '../citizens/city-sidewalks'
import { EDO } from '../themes/palettes'
import { contains, type Rect } from '../themes/lot-math'
import { distributedTown } from './distributed-town'
import { fallbackDress } from './fallback-dress'
import { SIDEWALK_M } from './town-grid'
import { groundBuffers, groundQuads, type GroundQuad } from './town-ground'
import { LARGE_FLOOR, roadStrip } from './town.test-utils'
import { townOf } from './use-town-plan'

const { plan } = distributedTown(townOf(LARGE_FLOOR, null), [LARGE_FLOOR])
const dress = fallbackDress(EDO)
const quads = groundQuads(plan, dress)
const of = (layer: GroundQuad['layer']): GroundQuad[] =>
  quads.filter((quad) => quad.layer === layer)
const same = (a: Rect, b: Rect): boolean => contains(a, b) && contains(b, a)

describe('groundQuads', () => {
  it('lays a pad under every block and park in its zone’s ground colour', () => {
    const pads = of('pad')
    const parks = plan.lots.filter((lot) => lot.zone === 'park')
    expect(pads).toHaveLength(plan.blocks.length + parks.length)
    for (const block of plan.blocks) {
      const pad = pads.find((quad) => same(quad, block))
      expect(pad?.color, block.id).toBe(dress.looks[block.zone].ground)
    }
    for (const park of parks) {
      const pad = pads.find((quad) => same(quad, park))
      expect(pad?.color, park.id).toBe(dress.looks.park.ground)
    }
  })

  it('paves every road, with a carriageway down each one a vehicle may use', () => {
    const paved = of('sidewalk')
    const driven = of('carriageway')
    expect(plan.roads.length).toBeGreaterThan(0)
    for (const road of plan.roads) {
      const strip = roadStrip(road)
      expect(
        paved.some((quad) => contains(quad, strip)),
        road.id
      ).toBe(true)
      // A stub can be shorter than it is wide, so its direction is read off its ends.
      const isAlongX = road.from.z === road.to.z
      const kerbs = SIDEWALK_M[road.class] * 2
      const carriageway = isAlongX
        ? { ...strip, depth: strip.depth - kerbs }
        : { ...strip, width: strip.width - kerbs }
      // Kerb to kerb across; along, it may carry on through a corner past either end.
      const isDownRoad = (quad: Rect): boolean =>
        contains(quad, carriageway) &&
        (isAlongX
          ? quad.z === carriageway.z && quad.depth === carriageway.depth
          : quad.x === carriageway.x && quad.width === carriageway.width)
      expect(driven.some(isDownRoad), road.id).toBe(road.class !== 'lane')
    }
    for (const quad of driven) expect(quad.color).toBe(dress.roads.carriageway)
    for (const quad of paved) expect(quad.color).toBe(dress.roads.sidewalk)
  })

  it('paints the carriageways the walkers’ ground shuts, and no others', () => {
    const shut = citySidewalks(plan).network.carriageways
    const painted = of('carriageway').map(({ x, z, width, depth }) => ({ x, z, width, depth }))
    expect(shut.length).toBeGreaterThan(0)
    expect(painted).toEqual(shut)
  })

  it('stacks the layers in order, all just above the ground the offices stand on', () => {
    const order: GroundQuad['layer'][] = ['pad', 'sidewalk', 'carriageway', 'marking']
    const heights = order.map((layer) => of(layer)[0].y)
    expect([...heights].sort((a, b) => a - b)).toEqual(heights)
    expect(new Set(heights).size).toBe(order.length)
    for (const quad of quads) {
      expect(quad.y).toBeGreaterThan(0)
      expect(quad.y).toBeLessThan(0.1)
    }
  })
})

describe('groundBuffers', () => {
  it('is two triangles a quad, flat at its height and coloured at every corner', () => {
    const { positions, colors } = groundBuffers(quads)
    expect(positions).toHaveLength(quads.length * 18)
    expect(colors).toHaveLength(positions.length)
    const [first] = quads
    const colour = new Color(first.color)
    for (let corner = 0; corner < 6; corner++) {
      expect(positions[corner * 3 + 1]).toBeCloseTo(first.y)
      expect(Math.abs(positions[corner * 3] - first.x)).toBeCloseTo(first.width / 2)
      expect(Math.abs(positions[corner * 3 + 2] - first.z)).toBeCloseTo(first.depth / 2)
      expect(colors[corner * 3]).toBeCloseTo(colour.r)
      expect(colors[corner * 3 + 2]).toBeCloseTo(colour.b)
    }
  })

  it('faces up, so the ground is seen from above', () => {
    const { positions } = groundBuffers(quads.slice(0, 1))
    const [ax, , az, bx, , bz, cx, , cz] = positions
    // The y part of (b - a) x (c - a).
    expect((bz - az) * (cx - ax) - (bx - ax) * (cz - az)).toBeGreaterThan(0)
  })
})
