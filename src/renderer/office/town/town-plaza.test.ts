import { describe, expect, it } from 'vitest'
import { routePose } from '../citizens/route-pose'
import { LIVE_FLOORS } from '../themes/floors.test-utils'
import { citizenTrips } from './citizen-trips'
import { townOn } from './movers.test-utils'
import { campusClaim, neededClaim } from './town-claim'
import { MIN_BELT_M, ROAD_WIDTH_M } from './town-grid'
import { campusGreen } from './town-green'
import { townBlocks } from './town-plan'
import { edges, overlapping, roadStrip } from './town.test-utils'
import { rectOf, type Rect } from '../themes/lot-math'

const NEAR = 0.01
// The avenue's half-width: its walkers and cars come through here.
const WAY_THROUGH_M = 6
const SIDEWALK_M = 1.5

// The square in front of the gate the pieces stand round: across the belt, twice the avenue deep.
function plazaSquare(claim: Rect): Rect {
  const west = edges(claim).west
  return rectOf(west, west + MIN_BELT_M, -ROAD_WIDTH_M.avenue, ROAD_WIDTH_M.avenue)
}

describe.each(LIVE_FLOORS)('the gate plaza: %s', (_name, floor) => {
  const plan = townBlocks(campusClaim(neededClaim(floor), null), 'full')
  const square = edges(plazaSquare(plan.claim))
  const pieces = campusGreen(floor, plan).filter((piece) => piece.id.startsWith('plaza:'))
  const west = pieces.filter((piece) => piece.x < (square.west + square.east) / 2)
  const east = pieces.filter((piece) => piece.x > (square.west + square.east) / 2)
  const row = (edge: typeof pieces): string[] =>
    edge.map((piece) => `${piece.role}@${piece.z.toFixed(2)}`).sort()

  it('carries the same pieces at the same pitch along its two long edges', () => {
    expect(west.length).toBeGreaterThanOrEqual(6)
    expect(row(west)).toEqual(row(east))
    const lamps = west
      .filter((piece) => piece.role === 'lamp' && piece.z > 0)
      .map((piece) => piece.z)
      .sort((a, b) => a - b)
    expect(lamps.length).toBeGreaterThanOrEqual(2)
    lamps
      .slice(1)
      .forEach((lamp, index) => expect(lamp - lamps[index]).toBeCloseTo(lamps[1] - lamps[0]))
  })

  it('flanks the way in with a matched pair, and mirrors about the avenue', () => {
    for (const edge of [west, east]) {
      const pairs = edge.filter((piece) => piece.role === 'plazaPair')
      expect(pairs).toHaveLength(2)
      expect(pairs[0].z).toBeCloseTo(-pairs[1].z)
      const nearest = Math.min(...edge.map((piece) => Math.abs(piece.z)))
      for (const pair of pairs) expect(Math.abs(pair.z)).toBeCloseTo(nearest)
      for (const piece of edge)
        expect(
          edge.some((other) => other.role === piece.role && Math.abs(other.z + piece.z) < NEAR)
        ).toBe(true)
    }
  })

  it('seats face in and every piece stands in the square', () => {
    for (const piece of pieces) {
      expect(piece.facing).toBe(piece.x < (square.west + square.east) / 2 ? 'east' : 'west')
      expect(overlapping(piece, plazaSquare(plan.claim))).toBe(true)
    }
    expect(pieces.filter((piece) => piece.role === 'seat').length).toBeGreaterThanOrEqual(4)
  })

  it('leaves its middle clear for the avenue and keeps off the carriageway and the walk', () => {
    for (const piece of pieces) {
      expect(Math.abs(piece.z) - piece.depth / 2).toBeGreaterThanOrEqual(WAY_THROUGH_M)
      for (const walk of plan.promenades) expect(overlapping(piece, walk)).toBe(false)
      for (const road of plan.roads) {
        const strip = roadStrip(road)
        const isAlongX = road.from.z === road.to.z
        const carriageway = isAlongX
          ? { ...strip, depth: strip.depth - SIDEWALK_M * 2 }
          : { ...strip, width: strip.width - SIDEWALK_M * 2 }
        expect(overlapping(piece, carriageway), `${piece.id} on ${road.id}`).toBe(false)
      }
    }
  })
})

describe('citizens bound for the plaza', () => {
  it('stand on at least four distinct points', () => {
    const town = townOn(LIVE_FLOORS[2][1])
    const ends = citizenTrips(town, 120)
      .filter((trip) => trip.destination === 'plaza')
      .map((trip) => {
        const goal = routePose(trip.route, trip.route.stops?.[0].at ?? 0)
        return `${goal.x.toFixed(2)}:${goal.z.toFixed(2)}`
      })
    expect(new Set(ends).size).toBeGreaterThanOrEqual(4)
  })
})
