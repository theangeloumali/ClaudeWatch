import { describe, expect, it } from 'vitest'
import { QUALITY_LEVELS } from '../logic/quality'
import { LIVE_FLOORS } from '../themes/floors.test-utils'
import { campusClaim, neededClaim } from './town-claim'
import { BLOCK_PITCH_M, BUILDING_CAP, MIN_BELT_M, OLD_TOWN_BLOCKS, RING_M } from './town-grid'
import { planTown, townBlocks, townExtent } from './town-plan'
import { zoneOfBlock } from './town-zones'
import { LARGE_FLOOR, edges, gap, median, overlapping } from './town.test-utils'

const claimOf = (floor: (typeof LIVE_FLOORS)[number][1]) => campusClaim(neededClaim(floor), null)

describe.each(LIVE_FLOORS)('the town plan: %s', (_name, floor) => {
  const claim = claimOf(floor)
  const plan = planTown(claim, 'full')

  it('is the same plan for the same floor, built twice from nothing', () => {
    expect(planTown(claimOf(floor), 'full')).toEqual(plan)
  })

  it('is built once for a claim and a detail level, then handed back', () => {
    expect(townBlocks(claimOf(floor), 'full')).toBe(townBlocks(claim, 'full'))
    expect(townBlocks(claim, 'full')).toEqual(plan)
    expect(townBlocks(claim, 'light')).not.toBe(townBlocks(claim, 'full'))
  })

  it('keeps the plate inside the envelope, the claim less the belt', () => {
    expect(edges(plan.envelope)).toEqual({
      west: edges(claim).west + MIN_BELT_M,
      east: edges(claim).east - MIN_BELT_M,
      north: edges(claim).north + MIN_BELT_M,
      south: edges(claim).south - MIN_BELT_M
    })
    expect(gap(floor, plan.envelope)).toBe(0)
    expect(edges(floor).east).toBeLessThanOrEqual(edges(plan.envelope).east)
    expect(edges(floor).west).toBeGreaterThanOrEqual(edges(plan.envelope).west)
  })

  it.each(QUALITY_LEVELS)(
    'reaches three sides by the ring and west by the old town at %s',
    (detail) => {
      expect(edges(townExtent(claim, detail))).toEqual({
        west: edges(claim).west - OLD_TOWN_BLOCKS[detail] * BLOCK_PITCH_M,
        east: edges(claim).east + RING_M[detail],
        north: edges(claim).north - RING_M[detail],
        south: edges(claim).south + RING_M[detail]
      })
      expect(planTown(claim, detail).extent).toEqual(townExtent(claim, detail))
    }
  )

  it('lists every block that has ground outside the claim, with its zone', () => {
    expect(new Set(plan.blocks.map((block) => block.id)).size).toBe(plan.blocks.length)
    for (const block of plan.blocks) {
      expect(block.id).toBe(`block:${block.column}:${block.row}`)
      expect(block.zone).toBe(zoneOfBlock(block.column, block.row))
      expect(edges(block).west).toBeGreaterThanOrEqual(block.column * BLOCK_PITCH_M)
      expect(edges(block).east).toBeLessThanOrEqual((block.column + 1) * BLOCK_PITCH_M)
      expect(edges(block).north).toBeGreaterThanOrEqual(block.row * BLOCK_PITCH_M)
      expect(edges(block).south).toBeLessThanOrEqual((block.row + 1) * BLOCK_PITCH_M)
      expect(gap(block, plan.extent)).toBe(0)
      // Not wholly under the claim.
      expect(
        edges(block).west < edges(claim).west ||
          edges(block).east > edges(claim).east ||
          edges(block).north < edges(claim).north ||
          edges(block).south > edges(claim).south
      ).toBe(true)
    }
    const known = new Set(plan.blocks.map((block) => block.id))
    for (const lot of plan.lots) expect(known.has(lot.blockId)).toBe(true)
  })

  it('protects a promenade for every road walk and every park block', () => {
    const parks = plan.blocks.filter(
      (block) => block.zone === 'park' && plan.lots.some((lot) => lot.blockId === block.id)
    )
    expect(plan.promenades).toHaveLength(5 + parks.length)
    for (const park of parks)
      expect(plan.promenades.some((walk) => overlapping(walk, park))).toBe(true)
  })

  it('carries its roads and their graph', () => {
    expect(plan.roads.filter((road) => road.class === 'boulevard')).toHaveLength(4)
    expect(plan.graph.nodes.length).toBeGreaterThan(100)
    expect(plan.graph.edges.length).toBeGreaterThan(plan.graph.nodes.length)
  })

  it.each(QUALITY_LEVELS)('builds no more than the cap at %s', (detail) => {
    const buildings = planTown(claim, detail).lots.filter((lot) => lot.kind === 'building')
    expect(buildings.length).toBeLessThanOrEqual(BUILDING_CAP[detail])
    expect(buildings.length).toBeGreaterThan(40)
  })
})

describe('planTown, timed', () => {
  it('plans the largest floor in a few milliseconds once warm', () => {
    const claim = claimOf(LARGE_FLOOR)
    for (let warmUp = 0; warmUp < 20; warmUp++) planTown(claim, 'full')
    const times = Array.from({ length: 30 }, () => {
      const start = performance.now()
      planTown(claim, 'full')
      return performance.now() - start
    })
    console.info(`planTown, largest floor, full: median ${median(times).toFixed(2)} ms`)
    // The aim is 5 ms; the bound is loose because the suite shares the machine.
    expect(median(times)).toBeLessThan(50)
  })
})
