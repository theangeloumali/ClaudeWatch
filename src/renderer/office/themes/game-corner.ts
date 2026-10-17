import { clamp } from '../../../shared/range'
import type { LoungeGeometry } from '../scene-model'
import { isWalkable, spotAt, WALL_GAP_M, type Footprint } from './lounge-layout'
import { grow, overlaps } from './lot-math'
import { box, lit, type PartSpec } from './parts'
import type { ThemePalette } from './types'

// dry-new: theme lounges are canteens and tea decks; none has a screen, beanbags or arcade cabinets.

// A direction snapped to one axis: exactly one of x and z is ±1.
interface Facing {
  x: number
  z: number
}

interface Cabinet extends Footprint {
  facing: Facing
}

const SCREEN = { bottom: 0.55, height: 1.15, depth: 0.08, minWidth: 2, maxWidth: 4.2 }
const CABINET = { width: 0.7, depth: 0.6 }
const CABINET_COUNT = 2
const RUG_INSET_M = 0.2
const TRIM_M = 0.06
const BAG_COLOURS = ['lacquer', 'copper', 'blossom'] as const

const facingOf = (heading: number): Facing =>
  Math.abs(Math.sin(heading)) > Math.abs(Math.cos(heading))
    ? { x: Math.sign(Math.sin(heading)), z: 0 }
    : { x: 0, z: Math.sign(Math.cos(heading)) }

const reverse = (facing: Facing): Facing => ({ x: -facing.x, z: -facing.z })

// Parts modelled facing +z about the origin, turned to `facing` and moved to `origin`.
function placed(parts: readonly PartSpec[], origin: { x: number; z: number }, facing: Facing) {
  return parts.map(
    ({ at: [x, y, z], size: [width, height, depth], ...part }): PartSpec => ({
      ...part,
      at: [origin.x + x * facing.z + z * facing.x, y, origin.z - x * facing.x + z * facing.z],
      size: facing.x === 0 ? [width, height, depth] : [depth, height, width]
    })
  )
}

// Where a seated agent's pelvis rests, before furniture scale.
export const BEANBAG_SEAT_M = 0.24

// The bag's body alone: what the overview draws, where a back or cushion would not read.
export function beanbagBodyPart(palette: ThemePalette, index: number): PartSpec {
  return box([0, 0.08, 0], [0.64, 0.16, 0.64], palette[BAG_COLOURS[index % BAG_COLOURS.length]])
}

// A squashed bag with a raised back, low enough that a seated agent sits into it.
export function beanbagParts(palette: ThemePalette, index: number): PartSpec[] {
  const colour = palette[BAG_COLOURS[index % BAG_COLOURS.length]]
  return [
    beanbagBodyPart(palette, index),
    box([0, BEANBAG_SEAT_M - 0.04, 0.02], [0.54, 0.08, 0.5], colour),
    box([0, 0.21, -0.24], [0.6, 0.18, 0.16], colour)
  ]
}

function arcadeCabinetParts(palette: ThemePalette): PartSpec[] {
  return [
    box([0, 0.75, -0.05], [0.7, 1.5, 0.5], palette.lacquer),
    box([0, 1.58, 0], [0.7, 0.16, 0.6], palette.gold),
    lit(box([0, 1.22, 0.21], [0.5, 0.38, 0.02], palette.glow)),
    box([0, 0.95, 0.24], [0.66, 0.1, 0.12], palette.brass),
    box([-0.14, 1.04, 0.24], [0.04, 0.09, 0.04], palette.ink),
    box([0.08, 1.01, 0.24], [0.05, 0.03, 0.05], palette.gold),
    box([0.18, 1.01, 0.24], [0.05, 0.03, 0.05], palette.gold)
  ]
}

// Modelled facing the seats (+z) from the far edge at z = 0: a dark frame on two legs.
function screenParts(width: number, palette: ThemePalette): PartSpec[] {
  const frameZ = WALL_GAP_M + SCREEN.depth / 2
  const frameY = SCREEN.bottom + SCREEN.height / 2
  return [
    box([0, frameY, frameZ], [width, SCREEN.height, SCREEN.depth], palette.ink),
    lit(box([0, frameY, frameZ + 0.05], [width - 0.14, SCREEN.height - 0.14, 0.02], palette.glow)),
    ...[-1, 1].map((side) =>
      box(
        [side * (width / 2 - 0.15), SCREEN.bottom / 2, frameZ],
        [0.08, SCREEN.bottom, 0.08],
        palette.ink
      )
    )
  ]
}

// The far edge behind the screen, centred on the seats but never past the corner's sides.
function screenSite(lounge: LoungeGeometry, ahead: Facing) {
  const side = { x: ahead.z, z: -ahead.x }
  const beside = (point: { x: number; z: number }) => point.x * side.x + point.z * side.z
  const [lateralSize, aheadSize] =
    ahead.x === 0 ? [lounge.width, lounge.depth] : [lounge.depth, lounge.width]
  const lateral = lounge.seats.map(beside)
  const span = lateral.length ? Math.max(...lateral) - Math.min(...lateral) : 0
  const width = Math.min(clamp(span + 0.8, [SCREEN.minWidth, SCREEN.maxWidth]), lateralSize - 0.6)
  const seatsMid = lateral.length
    ? lateral.reduce((sum, x) => sum + x, 0) / lateral.length
    : beside(lounge)
  const slack = lateralSize / 2 - width / 2
  const offset = clamp(seatsMid - beside(lounge), [-slack, slack])
  const origin = {
    x: lounge.x + (ahead.x * aheadSize) / 2 + side.x * offset,
    z: lounge.z + (ahead.z * aheadSize) / 2 + side.z * offset
  }
  // The frame, and the panel in front of it, past the gap at the far edge.
  const reach = SCREEN.depth + 0.02
  const footprint: Footprint = {
    x: origin.x - ahead.x * (WALL_GAP_M + reach / 2),
    z: origin.z - ahead.z * (WALL_GAP_M + reach / 2),
    width: ahead.x === 0 ? width : reach,
    depth: ahead.x === 0 ? reach : width
  }
  return { width, origin, footprint }
}

// Against a side wall, or the far or door wall at a corner, facing into the corner.
function cabinetSpots(lounge: LoungeGeometry, ahead: Facing): Cabinet[] {
  const side = { x: ahead.z, z: -ahead.x }
  const spot = (sideShare: number, aheadShare: number, facing: Facing): Cabinet => {
    const [width, depth] =
      facing.x === 0 ? [CABINET.width, CABINET.depth] : [CABINET.depth, CABINET.width]
    const xShare = sideShare * side.x + aheadShare * ahead.x
    const zShare = sideShare * side.z + aheadShare * ahead.z
    return { ...spotAt(lounge, xShare, zShare, width, depth), facing }
  }
  // Its back to the nearest wall: the far wall, a side wall or the door's wall.
  const facingAt = (sideShare: number, aheadShare: number): Facing =>
    aheadShare === 1
      ? reverse(ahead)
      : aheadShare === -1
        ? ahead
        : { x: -sideShare * side.x, z: -sideShare * side.z }
  // Sides alternate, so a corner laid out evenly gets a matching pair.
  return [1, 0.5, 0, -0.5, -1].flatMap((aheadShare) =>
    [-1, 1].map((sideShare) => spot(sideShare, aheadShare, facingAt(sideShare, aheadShare)))
  )
}

function layOut(lounge: LoungeGeometry) {
  const ahead = facingOf(lounge.seats[0]?.heading ?? 0)
  const site = screenSite(lounge, ahead)
  // One pass: a spot passed over stays covered, so each walk is checked once at most.
  const cabinets: Cabinet[] = []
  for (const spot of cabinetSpots(lounge, ahead)) {
    if (cabinets.length === CABINET_COUNT) break
    const isFree = ![site.footprint, ...cabinets].some((other) => overlaps(spot, other))
    if (isFree && isWalkable(lounge, spot)) cabinets.push(spot)
  }
  return { ahead, site, cabinets }
}

// A rug, a beanbag at every seat, a wall screen beyond them, and arcade cabinets out of the way.
export function gameCornerParts(lounge: LoungeGeometry, palette: ThemePalette): PartSpec[] {
  const { ahead, site, cabinets } = layOut(lounge)
  const rug = grow(lounge, -RUG_INSET_M)
  return [
    box([rug.x, 0.015, rug.z], [rug.width, 0.03, rug.depth], palette.ink),
    ...[-1, 1].flatMap((side) => [
      box(
        [rug.x, 0.035, rug.z + side * (rug.depth / 2 - TRIM_M / 2)],
        [rug.width, 0.01, TRIM_M],
        palette.gold
      ),
      box(
        [rug.x + side * (rug.width / 2 - TRIM_M / 2), 0.035, rug.z],
        [TRIM_M, 0.01, rug.depth],
        palette.gold
      )
    ]),
    ...lounge.seats.flatMap((seat, index) =>
      placed(beanbagParts(palette, index), seat, facingOf(seat.heading))
    ),
    ...placed(screenParts(site.width, palette), site.origin, reverse(ahead)),
    ...cabinets.flatMap((cabinet) => placed(arcadeCabinetParts(palette), cabinet, cabinet.facing))
  ]
}
