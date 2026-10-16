import { Color } from 'three'
import type { Rect } from '../themes/lot-math'
import type { TownDress } from './town-dress'
import { SIDEWALK_M } from './town-grid'
import type { TownPlan } from './town-plan'
import type { TownRoad } from './town-roads'
import { CROSSWALK_DEPTH_M, crosswalks, roadCrossings } from '../../../shared/office/crosswalks'

// Lifts above the ground, lowest first: a later layer lies over an earlier one. These are the
// heights the Phase 6 flicker sweep passed with; moving one means running it again.
const LIFTS = { pad: 1, sidewalk: 4, carriageway: 5, marking: 7 } as const
type GroundLayer = keyof typeof LIFTS

export interface GroundQuad extends Rect {
  layer: GroundLayer
  y: number
  color: string
}

// Far enough apart for the depth buffer at the widest zoom, and too little to see as a step.
const LAYER_LIFT_M = 0.01
const CORNERS_PER_QUAD = 6

function quad(layer: GroundLayer, rect: Rect, color: string): GroundQuad {
  const { x, z, width, depth } = rect
  return {
    layer,
    x,
    z,
    width,
    depth,
    y: LIFTS[layer] * LAYER_LIFT_M,
    color
  }
}

// The ground a road covers, `inset` in from each kerb. A boulevard strip runs corner to corner
// of its centre line, so it is carried on to square the corner off.
function strip(road: TownRoad, inset: number): Rect {
  const overrun = road.class === 'boulevard' ? road.width / 2 - inset : 0
  const across = road.width - inset * 2
  const isAlongX = road.from.z === road.to.z
  const [from, to] = isAlongX ? [road.from.x, road.to.x] : [road.from.z, road.to.z]
  const along = Math.abs(to - from) + overrun * 2
  return {
    x: (road.from.x + road.to.x) / 2,
    z: (road.from.z + road.to.z) / 2,
    width: isAlongX ? along : across,
    depth: isAlongX ? across : along
  }
}

// Everything underfoot in the city, as flat rectangles: a pad per block in its zone's colour,
// the parks over their blocks, then roads and their paint.
export function groundQuads(plan: TownPlan, dress: TownDress): GroundQuad[] {
  const { roads } = dress
  return [
    ...plan.blocks.map((block) => quad('pad', block, dress.looks[block.zone].ground)),
    ...plan.lots
      .filter((lot) => lot.zone === 'park')
      .map((lot) => ({ ...quad('pad', lot, dress.looks.park.ground), y: LAYER_LIFT_M * 1.5 })),
    ...plan.roads.map((road) => quad('sidewalk', strip(road, 0), roads.sidewalk)),
    ...plan.roads
      .filter((road) => road.class !== 'lane')
      .map((road) => quad('carriageway', strip(road, SIDEWALK_M[road.class]), roads.carriageway)),
    ...streetMarkings(plan.roads, dress)
  ]
}

const DASH_LENGTH_M = 3
const DASH_PITCH_M = 6
const CROSSWALK_GAP_M = 0.9

function roadStroke(options: {
  road: TownRoad
  from: number
  to: number
  offset: number
  width: number
  color: string
}): GroundQuad {
  const { road, from, to, offset, width, color } = options
  const isAlongX = road.from.z === road.to.z
  return quad(
    'marking',
    {
      x: isAlongX ? (from + to) / 2 : road.from.x + offset,
      z: isAlongX ? road.from.z + offset : (from + to) / 2,
      width: isAlongX ? to - from : width,
      depth: isAlongX ? width : to - from
    },
    color
  )
}

// Paint and lane paths both consume each road's actual width.
function streetMarkings(roads: readonly TownRoad[], dress: TownDress): GroundQuad[] {
  const zebras = crosswalks(roads)
  return roads.flatMap((road) => {
    if (road.class === 'lane') return []
    const isAlongX = road.from.z === road.to.z
    const start = isAlongX ? Math.min(road.from.x, road.to.x) : Math.min(road.from.z, road.to.z)
    const end = isAlongX ? Math.max(road.from.x, road.to.x) : Math.max(road.from.z, road.to.z)
    const halfCarriageway = road.width / 2 - SIDEWALK_M[road.class]
    const crossings = roadCrossings(road, roads)
    const marks: GroundQuad[] = []
    const stroke = (from: number, to: number, offset: number, width: number) => {
      if (from < start || to > end || to <= from) return
      marks.push(roadStroke({ road, from, to, offset, width, color: dress.roads.sidewalk }))
    }
    for (let from = start + 0.5; from + DASH_LENGTH_M < end; from += DASH_PITCH_M) {
      const to = from + DASH_LENGTH_M
      if (
        crossings.some(
          (crossing) =>
            from < crossing.position + crossing.halfWidth + 5 &&
            to > crossing.position - crossing.halfWidth - 5
        )
      )
        continue
      if (road.class !== 'avenue') stroke(from, to, 0, 0.18)
      if (road.class === 'avenue')
        for (const side of [-1, 1]) stroke(from, to, (side * halfCarriageway) / 2, 0.14)
    }
    const cuts = [
      ...new Set([
        start,
        end,
        ...crossings
          .flatMap((crossing) => [
            crossing.position - crossing.halfWidth - 5,
            crossing.position + crossing.halfWidth + 5
          ])
          .filter((position) => position > start && position < end)
      ])
    ].sort((first, second) => first - second)
    for (let index = 1; index < cuts.length; index++) {
      const from = cuts[index - 1],
        to = cuts[index],
        middle = (from + to) / 2
      if (
        crossings.some((crossing) => Math.abs(middle - crossing.position) < crossing.halfWidth + 5)
      )
        continue
      for (const side of [-1, 1]) {
        stroke(from, to, side * (halfCarriageway - 0.2), 0.12)
        if (road.class === 'avenue') stroke(from, to, side * 0.14, 0.12)
      }
    }
    const along = (point: { x: number; z: number }): number => (isAlongX ? point.x : point.z)
    const across = (point: { x: number; z: number }): number =>
      isAlongX ? point.z - road.from.z : point.x - road.from.x
    for (const zebra of zebras.filter((each) => each.roadId === road.id)) {
      const centre = along(zebra.centre)
      for (
        let stripe = -halfCarriageway + 0.6;
        stripe < halfCarriageway - 0.3;
        stripe += CROSSWALK_GAP_M
      )
        stroke(centre - CROSSWALK_DEPTH_M / 2, centre + CROSSWALK_DEPTH_M / 2, stripe, 0.42)
      const [approach] = zebra.stopLines
      const stop = along(approach)
      stroke(stop - 0.12, stop + 0.12, across(approach), halfCarriageway - 0.3)
    }
    return marks
  })
}

// Two triangles a quad, wound to face up, with its colour at every corner: one mesh, one draw.
export function groundBuffers(quads: readonly GroundQuad[]): {
  positions: Float32Array
  colors: Float32Array
} {
  const positions = new Float32Array(quads.length * CORNERS_PER_QUAD * 3)
  const colors = new Float32Array(positions.length)
  const color = new Color()
  quads.forEach(({ x, y, z, width, depth, color: hex }, index) => {
    const west = x - width / 2
    const east = x + width / 2
    const north = z - depth / 2
    const south = z + depth / 2
    const offset = index * CORNERS_PER_QUAD * 3
    // prettier-ignore
    positions.set([
      west, y, north,  west, y, south,  east, y, south,
      west, y, north,  east, y, south,  east, y, north
    ], offset)
    color.set(hex)
    for (let corner = 0; corner < CORNERS_PER_QUAD; corner++)
      color.toArray(colors, offset + corner * 3)
  })
  return { positions, colors }
}
