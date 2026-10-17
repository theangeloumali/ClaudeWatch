import { clamp } from '../../../shared/range'
import type { LoungeGeometry } from '../scene-model'
import { spotAt, WALL_GAP_M, type Footprint } from './lounge-layout'
import { gapBetween, grow } from './lot-math'
import { box, lit, type PartSpec } from './parts'
import type { ThemePalette } from './types'

// dry-new: theme lounges are canteens and tea decks; none has a screen, beanbags or arcade cabinets.

// A direction snapped to one axis: exactly one of x and z is ±1.
interface Facing {
  x: number
  z: number
}

const SCREEN = { bottom: 0.55, height: 1.15, depth: 0.08, minWidth: 2, maxWidth: 4.2 }
// Slim beside a full front row's outer bag; shallow, so a gamer rounding that seat passes clear.
const CABINET = { width: 0.56, depth: 0.44 }
const CABINET_SCREEN_GAP_M = 0.1
const BAG_M = 0.64
const BAG_CLEAR_M = 0.05
const RUG_INSET_M = 0.2
const TRIM_M = 0.06
const BAG_COLOURS = ['lacquer', 'copper', 'blossom'] as const

const facingOf = (heading: number): Facing =>
  Math.abs(Math.sin(heading)) > Math.abs(Math.cos(heading))
    ? { x: Math.sign(Math.sin(heading)), z: 0 }
    : { x: 0, z: Math.sign(Math.cos(heading)) }

const reverse = (facing: Facing): Facing => ({ x: -facing.x, z: -facing.z })

// How far a point lies across the way the seats face.
const besideOf =
  (ahead: Facing) =>
  (point: { x: number; z: number }): number =>
    point.x * ahead.z - point.z * ahead.x

// A footprint's size across the way the seats face, and along it.
const acrossSize = (rect: Footprint, ahead: Facing): number =>
  ahead.x === 0 ? rect.width : rect.depth
const aheadSize = (rect: Footprint, ahead: Facing): number =>
  ahead.x === 0 ? rect.depth : rect.width

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

// Each seat's parts, modelled facing +z about the seat: one transform for both views.
function atSeats(lounge: LoungeGeometry, partsAt: (index: number) => PartSpec[]): PartSpec[] {
  return lounge.seats.flatMap((seat, index) => placed(partsAt(index), seat, facingOf(seat.heading)))
}

// Where a seated agent's pelvis rests, before furniture scale.
export const BEANBAG_SEAT_M = 0.24

// The bag's body alone: what the overview draws, where a back or cushion would not read.
function beanbagBodyPart(palette: ThemePalette, index: number): PartSpec {
  return box([0, 0.08, 0], [BAG_M, 0.16, BAG_M], palette[BAG_COLOURS[index % BAG_COLOURS.length]])
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
    box([0, 0.75, -0.04], [CABINET.width, 1.5, 0.36], palette.lacquer),
    box([0, 1.58, 0], [CABINET.width, 0.16, CABINET.depth], palette.gold),
    lit(box([0, 1.22, 0.15], [0.4, 0.38, 0.02], palette.glow)),
    box([0, 0.95, 0.17], [0.52, 0.1, 0.1], palette.brass),
    box([-0.11, 1.04, 0.17], [0.04, 0.09, 0.04], palette.ink),
    box([0.06, 1.01, 0.17], [0.05, 0.03, 0.05], palette.gold),
    box([0.15, 1.01, 0.17], [0.05, 0.03, 0.05], palette.gold)
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

interface ScreenSpan {
  width: number
  // Across the corner from its middle.
  offset: number
}

// Wide enough to span the seats, centred on them but never past the corner's sides.
function wantedScreen(lounge: LoungeGeometry, ahead: Facing): ScreenSpan {
  const beside = besideOf(ahead)
  const lateralSize = acrossSize(lounge, ahead)
  const lateral = lounge.seats.map(beside)
  const span = lateral.length ? Math.max(...lateral) - Math.min(...lateral) : 0
  const width = Math.min(clamp(span + 0.8, [SCREEN.minWidth, SCREEN.maxWidth]), lateralSize - 0.6)
  const seatsMid = lateral.length
    ? lateral.reduce((sum, x) => sum + x, 0) / lateral.length
    : beside(lounge)
  const slack = lateralSize / 2 - width / 2
  return { width, offset: clamp(seatsMid - beside(lounge), [-slack, slack]) }
}

// The screen on the far edge.
function screenSite(lounge: LoungeGeometry, ahead: Facing, { width, offset }: ScreenSpan) {
  const side = { x: ahead.z, z: -ahead.x }
  const reachAhead = aheadSize(lounge, ahead) / 2
  const origin = {
    x: lounge.x + ahead.x * reachAhead + side.x * offset,
    z: lounge.z + ahead.z * reachAhead + side.z * offset
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

// The two back corners of the band behind the front row, where they clear every bag.
function cabinetSpots(lounge: LoungeGeometry, ahead: Facing): Footprint[] {
  const side = { x: ahead.z, z: -ahead.x }
  const [width, depth] =
    ahead.x === 0 ? [CABINET.width, CABINET.depth] : [CABINET.depth, CABINET.width]
  const along = (point: { x: number; z: number }) => point.x * ahead.x + point.z * ahead.z
  const frontRow = Math.max(...lounge.seats.map(along))
  const isBehindFrontRow = (spot: Footprint) => along(spot) - aheadSize(spot, ahead) / 2 >= frontRow
  const isClearOfBags = (spot: Footprint) =>
    lounge.seats.every(
      ({ x, z }) => gapBetween(spot, { x, z, width: BAG_M, depth: BAG_M }) >= BAG_CLEAR_M
    )
  return [-1, 1]
    .map((share) =>
      spotAt(lounge, share * side.x + ahead.x, share * side.z + ahead.z, width, depth)
    )
    .filter((spot) => isBehindFrontRow(spot) && isClearOfBags(spot))
}

// Two cabinets beside a narrower screen beat one, and one beats none.
function layOut(lounge: LoungeGeometry) {
  const ahead = facingOf(lounge.seats[0]?.heading ?? 0)
  const wanted = wantedScreen(lounge, ahead)
  const beside = besideOf(ahead)
  // The widest screen, about its centre, that keeps its gap to this cabinet.
  const widestBeside = (cabinet: Footprint): number =>
    2 *
    (Math.abs(beside(cabinet) - beside(lounge) - wanted.offset) -
      acrossSize(cabinet, ahead) / 2 -
      CABINET_SCREEN_GAP_M)
  const spots = cabinetSpots(lounge, ahead)
  for (const cabinets of [spots, ...spots.map((spot) => [spot])]) {
    const width = Math.min(wanted.width, ...cabinets.map(widestBeside))
    if (width >= SCREEN.minWidth)
      return { ahead, site: screenSite(lounge, ahead, { ...wanted, width }), cabinets }
  }
  return { ahead, site: screenSite(lounge, ahead, wanted), cabinets: [] }
}

// A rug, a beanbag at every seat, a wall screen beyond them, and arcade cabinets flanking it.
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
    ...atSeats(lounge, (index) => beanbagParts(palette, index)),
    ...placed(screenParts(site.width, palette), site.origin, reverse(ahead)),
    ...cabinets.flatMap((cabinet) => placed(arcadeCabinetParts(palette), cabinet, reverse(ahead)))
  ]
}

// The overview's corner: one bag body at every seat, and nothing else.
export function overviewCornerParts(lounge: LoungeGeometry, palette: ThemePalette): PartSpec[] {
  return atSeats(lounge, (index) => [beanbagBodyPart(palette, index)])
}
