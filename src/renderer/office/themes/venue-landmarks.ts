import type { WorldVenue } from '../../../shared/office/world-document'
import { box, cylinder, SIDES, type PartSpec } from './parts'
import type { Vector } from './primitives'
import type { ThemePalette } from './types'

// dry-new: venues were a slab, a canopy and posts; nothing gave each kind its own landmark.

// The slab VenueLayer lays under every venue; landmarks stand on it.
export const VENUE_SLAB_M = 0.16
const WAVE_SEGMENTS = 11

interface VenueLot {
  halfWidth: number
  halfDepth: number
  palette: ThemePalette
}

interface Awning {
  centre: Vector
  size: Vector
  bands: number
  along: 'x' | 'z'
}

type Spot = readonly [x: number, z: number]

const standing = ([x, z]: Spot, size: Vector, color: string): PartSpec =>
  box([x, VENUE_SLAB_M + size[1] / 2, z], size, color)

const pole = ([x, z]: Spot, size: Vector, color: string): PartSpec =>
  cylinder([x, VENUE_SLAB_M + size[1] / 2, z], size, color)

// Bands of lacquer and paper, split along one axis.
function stripedAwning({ centre, size, bands, along }: Awning, palette: ThemePalette): PartSpec[] {
  const length = along === 'x' ? size[0] : size[2]
  const band = length / bands
  return Array.from({ length: bands }, (_, index) => {
    const offset = -length / 2 + band * (index + 0.5)
    const color = index % 2 ? palette.paper : palette.lacquer
    return along === 'x'
      ? box([centre[0] + offset, centre[1], centre[2]], [band, size[1], size[2]], color)
      : box([centre[0], centre[1], centre[2] + offset], [size[0], size[1], band], color)
  })
}

// A cinema front: a bulb-lit marquee over the door, a blade sign, a screen and poster walls.
function arcade({ halfWidth, halfDepth, palette }: VenueLot): PartSpec[] {
  const front = -halfDepth
  const marqueeZ = front + 0.7
  const bladeX = halfWidth - 0.5
  const bulbs = Array.from({ length: 15 }, (_, index) => -4.2 + index * 0.6)
  return [
    box([0, 3.45, marqueeZ], [9, 0.9, 1.2], palette.lacquer),
    ...SIDES.map((side) =>
      standing([side * 4, marqueeZ], [0.3, 3 - VENUE_SLAB_M, 0.3], palette.brass)
    ),
    ...[3.2, 3.7].flatMap((y) =>
      bulbs.map((x) => box([x, y, front + 0.05], [0.14, 0.14, 0.1], palette.glow))
    ),
    standing([bladeX, front + 0.55], [0.25, 5.4, 0.25], palette.lacquer),
    box([bladeX, 4.1, front + 1.45], [0.18, 2.6, 1.6], palette.gold),
    box([bladeX, 4.1, front + 1.45], [0.22, 2.2, 1.2], palette.glow),
    standing([0, halfDepth - 0.35], [7, 2, 0.2], palette.ink),
    box([0, 2.22, halfDepth - 0.35], [7.3, 0.12, 0.3], palette.gold),
    ...SIDES.flatMap((side) => [
      standing([side * (halfWidth - 0.25), -0.5], [0.2, 2, 4], palette.lacquer),
      box([side * (halfWidth - 0.38), 1.3, -0.5], [0.06, 1.2, 3.2], palette.gold)
    ])
  ]
}

// A diner: a striped awning over the door, a railed terrace with umbrellas and a counter.
function lounge({ halfWidth, halfDepth, palette }: VenueLot): PartSpec[] {
  const front = -halfDepth
  const terraceX = halfWidth - 0.9
  const railX = halfWidth - 0.12
  return [
    ...stripedAwning(
      { centre: [0, 2.95, front + 0.85], size: [10, 0.12, 1.5], bands: 10, along: 'x' },
      palette
    ),
    box([0, 2.78, front + 0.12], [10.2, 0.3, 0.08], palette.lacquer),
    ...SIDES.map((side) => standing([side * 4.9, front + 0.3], [0.14, 2.73, 0.14], palette.brass)),
    standing([terraceX, 0.2], [1.6, 0.3, 8], palette.wood),
    box([railX, 1.16, 0.2], [0.08, 0.08, 8], palette.brass),
    ...[-3.4, -1.4, 0.6, 2.6].map((z) =>
      cylinder([railX, 0.81, z], [0.08, 0.7, 0.08], palette.brass)
    ),
    ...[-2, 2].flatMap((z) => [
      cylinder([terraceX, 1.38, z], [0.06, 1.84, 0.06], palette.brass),
      box([terraceX, 2.27, z], [1.5, 0.06, 1.5], palette.paper),
      box([terraceX, 1.1, z], [0.7, 0.05, 0.7], palette.paper)
    ]),
    standing([-(halfWidth - 0.4), -0.2], [0.6, 0.7, 5.6], palette.stone),
    box([-(halfWidth - 0.4), 1.26, -0.2], [0.5, 0.8, 5.4], palette.blossom),
    standing([0, halfDepth - 0.7], [6, 1, 0.7], palette.wood),
    box([0, 1.19, halfDepth - 0.7], [6.2, 0.06, 0.8], palette.paper),
    standing([0, halfDepth - 0.15], [5, 2.14, 0.12], palette.lacquer)
  ]
}

// Striped stalls down both sides and across the back, behind a gate with a sign board.
function market({ halfWidth, halfDepth, palette }: VenueLot): PartSpec[] {
  const front = -halfDepth
  const sideX = halfWidth - 0.75
  const backZ = halfDepth - 0.8
  const gateZ = front + 0.3
  const sideStalls = SIDES.flatMap((side) =>
    [-2.6, 1.2].flatMap((z) => [
      standing([side * sideX, z], [1.2, 0.9, 2], palette.wood),
      ...SIDES.map((end) =>
        standing([side * (sideX - 0.6), z + end * 0.9], [0.08, 2.04, 0.08], palette.brass)
      ),
      ...stripedAwning(
        { centre: [side * sideX, 2.25, z], size: [1.5, 0.1, 2.2], bands: 4, along: 'z' },
        palette
      )
    ])
  )
  return [
    ...sideStalls,
    standing([0, backZ], [5, 0.9, 1], palette.wood),
    ...SIDES.map((end) => standing([end * 2.6, backZ - 0.55], [0.08, 2.04, 0.08], palette.brass)),
    ...stripedAwning(
      { centre: [0, 2.25, backZ], size: [5.6, 0.1, 1.5], bands: 8, along: 'x' },
      palette
    ),
    ...SIDES.map((side) => standing([side * 2.1, gateZ], [0.25, 3.34, 0.25], palette.lacquer)),
    box([0, 3.6, gateZ], [4.7, 0.3, 0.35], palette.lacquer),
    box([0, 4.05, gateZ], [2.4, 0.6, 0.12], palette.gold),
    ...SIDES.flatMap((side) => [
      standing([side * 3.2, front + 0.6], [0.8, 0.6, 0.8], palette.wood),
      box([side * 3.2, 1.01, front + 0.6], [0.6, 0.5, 0.6], palette.copper)
    ])
  ]
}

// A filling station: a canopy over two pump islands, a price pylon and a service bay.
function garage({ halfWidth, halfDepth, palette }: VenueLot): PartSpec[] {
  const front = -halfDepth
  const canopyZ = front + 2.3
  const pylon: Spot = [-(halfWidth - 0.6), front + 0.35]
  return [
    box([0, 3.6, canopyZ], [11, 0.4, 2.6], palette.paper),
    box([0, 3.6, canopyZ], [11.2, 0.3, 2.8], palette.lacquer),
    ...SIDES.flatMap((side) => [
      pole([side * 3.2, canopyZ], [0.4, 3.24, 0.4], palette.stone),
      standing([side * 3.2, canopyZ], [1, 0.18, 2.4], palette.stone),
      ...[-0.7, 0.7].flatMap((offset) => [
        box([side * 3.2, 1.04, canopyZ + offset], [0.55, 1.4, 0.4], palette.lacquer),
        box([side * 3.2, 1.45, canopyZ + offset - 0.21], [0.4, 0.3, 0.04], palette.ink)
      ]),
      standing(
        [side * (halfWidth - 0.5), 1.4],
        [0.6, 1.8, 2.4],
        side > 0 ? palette.copper : palette.stone
      )
    ]),
    standing(pylon, [1, 4.6, 0.3], palette.lacquer),
    ...[3.2, 3.65, 4.1].map((y) =>
      box([pylon[0], y, pylon[1] - 0.17], [0.8, 0.28, 0.06], palette.ink)
    ),
    box([pylon[0], 4.86, pylon[1]], [1.2, 0.2, 0.4], palette.gold),
    standing([0, halfDepth - 0.4], [8, 2.1, 0.5], palette.stone),
    ...SIDES.map((side) => box([side * 2, 1.1, halfDepth - 0.67], [3, 1.8, 0.06], palette.brass))
  ]
}

// A transit stop: a wave roof on columns over the platform, a signal mast and a timetable.
function transit({ halfWidth, halfDepth, palette }: VenueLot): PartSpec[] {
  const roofZ = -halfDepth + 1.9
  const crest = (index: number): number => 3.5 + 0.35 * Math.sin((index * Math.PI) / 5)
  const segmentX = (index: number): number => index - (WAVE_SEGMENTS - 1) / 2
  const mast: Spot = [-(halfWidth - 0.7), halfDepth - 1]
  return [
    ...Array.from({ length: WAVE_SEGMENTS }, (_, index) =>
      box([segmentX(index), crest(index), roofZ], [1, 0.25, 3], palette.copper)
    ),
    ...[1, 3, 7, 9].map((index) =>
      pole([segmentX(index), roofZ], [0.3, crest(index) - VENUE_SLAB_M, 0.3], palette.stone)
    ),
    pole(mast, [0.24, 5.6, 0.24], palette.lacquer),
    ...[5.2, 4.7].map((y) => box([mast[0], y, mast[1]], [0.12, 0.1, 1.6], palette.gold)),
    box([mast[0], 5.88, mast[1]], [0.3, 0.24, 0.3], palette.glow),
    standing([1, halfDepth - 0.3], [6, 2.1, 0.15], palette.ink),
    ...SIDES.map((side) => standing([side * (halfWidth - 0.2), 0.8], [0.1, 2, 3.2], palette.brass))
  ]
}

const LANDMARKS: Record<WorldVenue['kind'], (lot: VenueLot) => PartSpec[]> = {
  arcade,
  lounge,
  market,
  garage,
  transit
}

// A venue's landmark in its own frame: centred on its footprint, the entrance toward -z.
export function venueLandmark(
  venue: Pick<WorldVenue, 'kind' | 'footprint'>,
  palette: ThemePalette
): PartSpec[] {
  const { width, depth } = venue.footprint
  return LANDMARKS[venue.kind]({ halfWidth: width / 2, halfDepth: depth / 2, palette })
}
