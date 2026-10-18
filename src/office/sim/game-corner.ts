import { WORKER_BODY_RADIUS } from '../../shared/office/body-footprints'
import { clamp } from '../../shared/range'
import { contains, footprintEdges, overlaps } from '../../shared/office/world-document-geometry'
import type { WorldFootprint } from '../../shared/office/world-document-types'
import type { LoungeLayout, Slot } from './layout'
import type { Point } from './path'
import { NAV_CELL_METRES, ROUTE_MARGIN_METRES } from './navigation'
import { LOUNGE_SEATS_PER_ROW, LOUNGE_WIDTH, loungeMetres } from './rooms'

const MAX_SEATS = 8
const WALL_METRES = 1
const ROOM_METRES = 1
const ENTRANCE_METRES = 2
// The renderer's contract: the front row sits this far from the screen on the edge it faces.
const SCREEN_METRES = 1.2
// Rows far enough apart for the router to walk a worker, the largest body, between two seated
// ones: a body and its margin each side, and half a grid cell for its column to fall in.
const ROW_STEP_METRES = 2 * (2 * WORKER_BODY_RADIUS + ROUTE_MARGIN_METRES + NAV_CELL_METRES / 2)

interface Direction {
  x: number
  z: number
}
const NORTH: Direction = { x: 0, z: -1 }
const SOUTH: Direction = { x: 0, z: 1 }
const WEST: Direction = { x: -1, z: 0 }
const EAST: Direction = { x: 1, z: 0 }

// The corner stands `outward` of the offices; its seats face `ahead`, at the screen on that edge.
interface Side {
  outward: Direction
  ahead: Direction
  heading: number
}
// The default camera looks from +x, +z, so seats face -z or -x and the screen faces it. A
// corner east or south of the offices turns sideways, its row corridors open to the offices.
const EAST_SIDEWAYS: Side = { outward: EAST, ahead: NORTH, heading: Math.PI }
const FACING_CAMERA: readonly Side[] = [
  { outward: NORTH, ahead: NORTH, heading: Math.PI },
  { outward: WEST, ahead: WEST, heading: -Math.PI / 2 },
  EAST_SIDEWAYS,
  { outward: SOUTH, ahead: WEST, heading: -Math.PI / 2 }
]
// Ruling: only where no camera-facing corner fits anywhere, so a floor still gets one.
const FACING_AWAY: readonly Side[] = [
  { outward: EAST, ahead: EAST, heading: Math.PI / 2 },
  { outward: SOUTH, ahead: SOUTH, heading: 0 }
]

interface CornerSize {
  seats: number
  across: number
}

// A seat for every desk on the floor, up to a full corner of eight.
export const cornerSeats = (deskCount: number): number => clamp(deskCount, [1, MAX_SEATS])

// Seats a pitch apart with half a metre beyond each end's half pitch; four make LOUNGE_WIDTH.
const rowWidth = (seats: number): number => loungeMetres(1 + 1.25 * seats)

// Fewer rows at the full width the renderer's screen and cabinets need, one size per row
// count since those share an area, then one row of fewer seats as narrow as they are (I2).
export function* cornerSizes(seats: number): Generator<CornerSize> {
  for (let rows = Math.ceil(seats / LOUNGE_SEATS_PER_ROW); rows > 0; rows--)
    yield { seats: Math.min(seats, rows * LOUNGE_SEATS_PER_ROW), across: LOUNGE_WIDTH }
  for (let count = Math.min(seats, LOUNGE_SEATS_PER_ROW); count > 0; count--)
    if (rowWidth(count) < LOUNGE_WIDTH) yield { seats: count, across: rowWidth(count) }
}

// Each row takes a row step, the last its aisle behind it; the front row its screen too.
export const cornerDepth = (seats: number): number =>
  SCREEN_METRES + Math.ceil(seats / LOUNGE_SEATS_PER_ROW) * ROW_STEP_METRES

// The box's size away from the offices and along them: rows `across` wide, stacked ahead.
function cornerBox({ outward, ahead }: Side, { seats, across }: CornerSize) {
  const isSideways = outward.x !== ahead.x || outward.z !== ahead.z
  const reach = cornerDepth(seats)
  return isSideways ? { away: across, along: reach } : { away: reach, along: across }
}

// How far a generated building keeps clear east of its offices: its full sideways corner.
export const eastCornerBand = (deskCount: number): number =>
  cornerBox(EAST_SIDEWAYS, { seats: cornerSeats(deskCount), across: LOUNGE_WIDTH }).away

interface CornerFloor {
  floorId: string
  footprint: WorldFootprint
  rooms: readonly WorldFootprint[]
  // The street door, on the ground floor only.
  entrance?: Point
  connector?: WorldFootprint
  deskCount: number
}

// The floor's game corner beside its offices, the largest any side has room for, or none
// when no side has room for one seat.
export function gameCorner(floor: CornerFloor): LoungeLayout | undefined {
  if (!floor.rooms.length) return undefined
  const envelope = enclose(floor.rooms)
  for (const sides of [FACING_CAMERA, FACING_AWAY])
    for (const size of cornerSizes(cornerSeats(floor.deskCount)))
      for (const side of sides) {
        const area = besideOffices(side.outward, envelope, floor.footprint, cornerBox(side, size))
        if (fits(area, floor)) return layOut(area, side, size.seats, floor.floorId)
      }
  return undefined
}

function fits(area: WorldFootprint, floor: CornerFloor): boolean {
  const local = { ...area, x: area.x - floor.footprint.x, z: area.z - floor.footprint.z }
  const entrance = floor.entrance && { ...floor.entrance, width: 0, depth: 0 }
  return (
    contains(floor.footprint, local, WALL_METRES) &&
    floor.rooms.every((room) => !overlaps(area, room, ROOM_METRES)) &&
    !(floor.connector && overlaps(area, floor.connector)) &&
    !(entrance && overlaps(area, entrance, ENTRANCE_METRES))
  )
}

function enclose(rooms: readonly WorldFootprint[]): WorldFootprint {
  const { west, east, north, south } = footprintEdges(rooms)
  return { x: (west + east) / 2, z: (north + south) / 2, width: east - west, depth: south - north }
}

// Its near edge a room gap from the offices, centred on them and slid inside the walls.
function besideOffices(
  outward: Direction,
  envelope: WorldFootprint,
  footprint: WorldFootprint,
  { away, along }: { away: number; along: number }
): WorldFootprint {
  const isAcrossX = outward.x !== 0
  const width = isAcrossX ? away : along
  const depth = isAcrossX ? along : away
  const slide = (centre: number, wall: number, span: number, size: number): number => {
    const slack = span / 2 - WALL_METRES - size / 2
    return slack < 0 ? centre : clamp(centre, [wall - slack, wall + slack])
  }
  const offset = (span: number, size: number) => span / 2 + ROOM_METRES + size / 2
  return {
    x: isAcrossX
      ? envelope.x + outward.x * offset(envelope.width, width)
      : slide(envelope.x, footprint.x, footprint.width, width),
    z: isAcrossX
      ? slide(envelope.z, footprint.z, footprint.depth, depth)
      : envelope.z + outward.z * offset(envelope.depth, depth),
    width,
    depth
  }
}

// The door mid-edge facing the offices; the front row by the screen, each further row a
// step back from it, all centred across the corner.
function layOut(area: WorldFootprint, side: Side, seats: number, floorId: string): LoungeLayout {
  const { outward, ahead, heading } = side
  const halfOf = ({ x }: Direction) => (x !== 0 ? area.width : area.depth) / 2
  const door = { x: area.x - outward.x * halfOf(outward), z: area.z - outward.z * halfOf(outward) }
  const screen = { x: area.x + ahead.x * halfOf(ahead), z: area.z + ahead.z * halfOf(ahead) }
  const across = { x: -ahead.z, z: ahead.x }
  const slots: Slot[] = Array.from({ length: seats }, (_, index) => {
    const row = Math.floor(index / LOUNGE_SEATS_PER_ROW)
    const inRow = Math.min(LOUNGE_SEATS_PER_ROW, seats - row * LOUNGE_SEATS_PER_ROW)
    const back = SCREEN_METRES + row * ROW_STEP_METRES
    const along = loungeMetres(1.25) * ((index % LOUNGE_SEATS_PER_ROW) - (inRow - 1) / 2)
    return {
      id: `games_seat_${index}`,
      x: screen.x - ahead.x * back + across.x * along,
      z: screen.z - ahead.z * back + across.z * along,
      heading
    }
  })
  return { id: `${floorId}:games`, ...area, door, slots }
}
