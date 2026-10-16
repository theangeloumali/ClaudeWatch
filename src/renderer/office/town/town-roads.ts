import type { Point } from '../../../office/sim/path'
import type { RoadClass, TownRoad } from '../../../shared/office/town-roads'
import { boundsOfZone } from '../logic/zone-framing'
import type { WallSide } from '../logic/room-layout'
import { grow, rectOf, type Rect, type Span } from '../themes/lot-math'
import {
  AVENUE_MEDIAN_M,
  BLOCK_PITCH_M,
  LOT_PITCH_M,
  ROAD_WIDTH_M,
  SIDEWALK_M,
  latticeLines
} from './town-grid'

export type { RoadClass, TownRoad }
// The coordinate a road line holds: an `x` road runs north to south, a `z` road west to east.
export type RoadAxis = 'x' | 'z'

const AXES: readonly RoadAxis[] = ['x', 'z']
// What the two stretches of a line cut by the claim are called.
const CUT_PARTS: Record<RoadAxis, readonly [WallSide, WallSide]> = {
  x: ['north', 'south'],
  z: ['west', 'east']
}

const crossAxis = (axis: RoadAxis): RoadAxis => (axis === 'x' ? 'z' : 'x')

// How far a rectangle reaches along one coordinate.
function reach(rect: Rect, axis: RoadAxis): Span {
  const bounds = boundsOfZone(rect)
  return axis === 'x'
    ? { min: bounds.minX, max: bounds.maxX }
    : { min: bounds.minZ, max: bounds.maxZ }
}

// What stands on a lattice line at the point `along` it, for a place outside the claim: the
// claim's edge (the boulevard lies just inside it), the avenue, a collector or a lane.
export function standingOn(axis: RoadAxis, line: number, along: number, claim: Rect): RoadClass {
  const held = reach(claim, axis)
  const beside = reach(claim, crossAxis(axis))
  const isBesideClaim = along > beside.min && along < beside.max
  if (isBesideClaim && (line === held.min || line === held.max)) return 'boulevard'
  // The avenue is z = 0 from the claim west; east of it the same line is a collector.
  const isGateLine = axis === 'z' && line === 0 && held.min < 0 && held.max > 0
  if (isGateLine && along < beside.min) return 'avenue'
  return line % BLOCK_PITCH_M === 0 ? 'collector' : 'lane'
}

function pointOn(axis: RoadAxis, line: number, along: number): Point {
  return axis === 'x' ? { x: line, z: along } : { x: along, z: line }
}

function latticeRoads(axis: RoadAxis, claim: Rect, extent: Rect): TownRoad[] {
  const held = reach(claim, axis)
  const hole = reach(claim, crossAxis(axis))
  const run = reach(extent, crossAxis(axis))
  const lines = reach(extent, axis)
  return latticeLines(lines.min, lines.max, LOT_PITCH_M).flatMap((line) => {
    // No road runs through the claim or along its edge: the boulevard is the road there.
    const isCut = line >= held.min && line <= held.max
    const stretches: Span[] = isCut
      ? [
          { min: run.min, max: hole.min },
          { min: hole.max, max: run.max }
        ]
      : [run]
    return stretches.flatMap((stretch, part) => {
      if (stretch.max <= stretch.min) return []
      const roadClass = standingOn(axis, line, (stretch.min + stretch.max) / 2, claim)
      const name = `road:${axis}:${line}${isCut ? `:${CUT_PARTS[axis][part]}` : ''}`
      return [
        {
          id: roadClass === 'avenue' ? 'avenue' : name,
          class: roadClass,
          from: pointOn(axis, line, stretch.min),
          to: pointOn(axis, line, stretch.max),
          width: ROAD_WIDTH_M[roadClass]
        }
      ]
    })
  })
}

function boulevard(claim: Rect): TownRoad[] {
  const { minX, maxX, minZ, maxZ } = boundsOfZone(grow(claim, -ROAD_WIDTH_M.boulevard / 2))
  const strips: readonly (readonly [WallSide, Point, Point])[] = [
    ['north', { x: minX, z: minZ }, { x: maxX, z: minZ }],
    ['east', { x: maxX, z: minZ }, { x: maxX, z: maxZ }],
    ['south', { x: minX, z: maxZ }, { x: maxX, z: maxZ }],
    ['west', { x: minX, z: minZ }, { x: minX, z: maxZ }]
  ]
  return strips.map(([side, from, to]) => ({
    id: `boulevard:${side}`,
    class: 'boulevard',
    from,
    to,
    width: ROAD_WIDTH_M.boulevard
  }))
}

// Collectors on the 24 m lines, lanes on the 12 m lines between, the avenue from the west edge
// of town to the claim, and the boulevard inside the claim against its edge.
export function townRoads(claim: Rect, extent: Rect): TownRoad[] {
  return [...AXES.flatMap((axis) => latticeRoads(axis, claim, extent)), ...boulevard(claim)]
}

// Strips where a citizen must be seen: the boulevard's inner sidewalk on all four sides, then
// the avenue's median.
export function roadPromenades(roads: readonly TownRoad[], claim: Rect): Rect[] {
  const outer = boundsOfZone(grow(claim, SIDEWALK_M.boulevard - ROAD_WIDTH_M.boulevard))
  const inner = boundsOfZone(grow(claim, -ROAD_WIDTH_M.boulevard))
  const medians = roads
    .filter((road) => road.class === 'avenue')
    .map((road) =>
      rectOf(
        Math.min(road.from.x, road.to.x),
        Math.max(road.from.x, road.to.x),
        road.from.z - AVENUE_MEDIAN_M / 2,
        road.from.z + AVENUE_MEDIAN_M / 2
      )
    )
  return [
    rectOf(outer.minX, outer.maxX, outer.minZ, inner.minZ),
    rectOf(inner.maxX, outer.maxX, outer.minZ, outer.maxZ),
    rectOf(outer.minX, outer.maxX, inner.maxZ, outer.maxZ),
    rectOf(outer.minX, inner.minX, outer.minZ, outer.maxZ),
    ...medians
  ]
}
