import { clamp } from '../../shared/range'
import { contains, footprintEdges, overlaps } from '../../shared/office/world-document-geometry'
import type { WorldFootprint } from '../../shared/office/world-document-types'
import type { LoungeLayout, Slot } from './layout'
import type { Point } from './path'
import { LOUNGE_SEATS_PER_ROW, LOUNGE_WIDTH, loungeDepth, loungeMetres } from './rooms'

const MAX_SEATS = 8
const WALL_METRES = 1
const ROOM_METRES = 1
const ENTRANCE_METRES = 2

// Tried in this order; seats face `outward`, away from the offices, at the screen on the far edge.
const SIDES = [
  { outward: { x: 0, z: -1 }, heading: Math.PI },
  { outward: { x: 1, z: 0 }, heading: Math.PI / 2 },
  { outward: { x: -1, z: 0 }, heading: -Math.PI / 2 },
  { outward: { x: 0, z: 1 }, heading: 0 }
] as const
type Side = (typeof SIDES)[number]

// A seat for every desk on the floor, up to a full corner of eight.
export const cornerSeats = (deskCount: number): number => clamp(deskCount, [1, MAX_SEATS])

interface CornerFloor {
  floorId: string
  footprint: WorldFootprint
  rooms: readonly WorldFootprint[]
  entrance: Point
  connector?: WorldFootprint
  deskCount: number
}

// The floor's game corner beside its offices, or none when no side has room for it.
export function gameCorner(floor: CornerFloor): LoungeLayout | undefined {
  if (!floor.rooms.length) return undefined
  const seats = cornerSeats(floor.deskCount)
  const envelope = enclose(floor.rooms)
  for (const side of SIDES) {
    const area = besideOffices(side, envelope, floor.footprint, loungeDepth(seats))
    if (fits(area, floor)) return layOut(area, side, seats, floor.floorId)
  }
  return undefined
}

function fits(area: WorldFootprint, floor: CornerFloor): boolean {
  const local = { ...area, x: area.x - floor.footprint.x, z: area.z - floor.footprint.z }
  const entrance = { ...floor.entrance, width: 0, depth: 0 }
  return (
    contains(floor.footprint, local, WALL_METRES) &&
    floor.rooms.every((room) => !overlaps(area, room, ROOM_METRES)) &&
    !(floor.connector && overlaps(area, floor.connector)) &&
    !overlaps(area, entrance, ENTRANCE_METRES)
  )
}

function enclose(rooms: readonly WorldFootprint[]): WorldFootprint {
  const { west, east, north, south } = footprintEdges(rooms)
  return { x: (west + east) / 2, z: (north + south) / 2, width: east - west, depth: south - north }
}

// Its near edge a room gap from the offices, centred on them and slid inside the walls.
function besideOffices(
  { outward }: Side,
  envelope: WorldFootprint,
  footprint: WorldFootprint,
  reach: number
): WorldFootprint {
  const isAcrossX = outward.x !== 0
  const width = isAcrossX ? reach : LOUNGE_WIDTH
  const depth = isAcrossX ? LOUNGE_WIDTH : reach
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

// Front row first, nearest the screen; each row centred across the corner.
function layOut(area: WorldFootprint, side: Side, seats: number, floorId: string): LoungeLayout {
  const { outward, heading } = side
  const across = { x: -outward.z, z: outward.x }
  const reach = outward.x !== 0 ? area.width : area.depth
  const door = { x: area.x - (outward.x * reach) / 2, z: area.z - (outward.z * reach) / 2 }
  const rows = Math.ceil(seats / LOUNGE_SEATS_PER_ROW)
  const slots: Slot[] = Array.from({ length: seats }, (_, index) => {
    const row = Math.floor(index / LOUNGE_SEATS_PER_ROW)
    const inRow = Math.min(LOUNGE_SEATS_PER_ROW, seats - row * LOUNGE_SEATS_PER_ROW)
    const out = loungeMetres(2 + (rows - 1 - row) * 2)
    const along = loungeMetres(1.25) * ((index % LOUNGE_SEATS_PER_ROW) - (inRow - 1) / 2)
    return {
      id: `games_seat_${index}`,
      x: door.x + outward.x * out + across.x * along,
      z: door.z + outward.z * out + across.z * along,
      heading
    }
  })
  return { id: `${floorId}:games`, ...area, door, slots }
}
