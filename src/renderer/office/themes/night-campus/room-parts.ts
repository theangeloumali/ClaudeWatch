import { FURNITURE_SCALE } from '../../../../shared/office/figure-scale'
import { ISO_START_AZIMUTH } from '../../logic/camera-bands'
import type { CampusRoomColors } from '../../logic/campus-colors'
import { DESK_REACH } from '../../logic/room-layout'
import type { DeskSlot, FloorGeometry } from '../../scene-model'
import { overlaps, type Rect } from '../lot-math'
import { box, type PartSpec } from '../parts'
import { BOOKSHELF, CHART_SCREEN, FLOOR_LAMP, PLANT, SOFA, type Prop } from './room-props'

export type WallSide = 'west' | 'east' | 'north' | 'south'

export const BACK_WALL_HEIGHT_M = 2.2
const WALL_THICKNESS_M = 0.18
const SLAB_THICKNESS_M = 0.36
const RUG_INSET_M = 0.5
// A desk with its chair, at the largest furniture scale, measured round its centre.
const DESK_CLEAR_M = 1.8 * FURNITURE_SCALE
const SOFA_MIN_DEPTH_M = 8
const PROP_GAP_M = 0.06

// The camera sits at (sin azimuth, cos azimuth); the walls go on the two sides facing away from it.
export function farSides(azimuth: number): readonly [WallSide, WallSide] {
  return [Math.sin(azimuth) > 0 ? 'west' : 'east', Math.cos(azimuth) > 0 ? 'north' : 'south']
}

// Fixed to the world: a rotated camera sees the same two walls, possibly from the front.
export const BACK_WALL_SIDES = farSides(ISO_START_AZIMUTH)

// Yaw turning a prop's local +z (out of the wall) into the room.
const INWARD_YAW: Record<WallSide, number> = {
  west: Math.PI / 2,
  north: 0,
  east: -Math.PI / 2,
  south: Math.PI
}

interface Plate {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

const plateOf = (floor: FloorGeometry): Plate => ({
  minX: floor.x - floor.width / 2,
  maxX: floor.x + floor.width / 2,
  minZ: floor.z - floor.depth / 2,
  maxZ: floor.z + floor.depth / 2
})

const isAcrossX = (side: WallSide) => side === 'west' || side === 'east'
const outward = (side: WallSide) => (side === 'west' || side === 'north' ? -1 : 1)

function wallOrigin(side: WallSide, plate: Plate) {
  const midX = (plate.minX + plate.maxX) / 2
  const midZ = (plate.minZ + plate.maxZ) / 2
  if (isAcrossX(side)) return { x: side === 'west' ? plate.minX : plate.maxX, z: midZ }
  return { x: midX, z: side === 'north' ? plate.minZ : plate.maxZ }
}

const wallLength = (side: WallSide, plate: Plate) =>
  isAcrossX(side) ? plate.maxZ - plate.minZ : plate.maxX - plate.minX

// A point given along the wall (local x) and out from it (local z), in floor coordinates.
function onWall(side: WallSide, plate: Plate, along: number, out: number) {
  const yaw = INWARD_YAW[side]
  const origin = wallOrigin(side, plate)
  return {
    x: origin.x + along * Math.cos(yaw) + out * Math.sin(yaw),
    z: origin.z - along * Math.sin(yaw) + out * Math.cos(yaw)
  }
}

// Authored props stand with their back on the wall at local z = 0.
function placed(parts: readonly PartSpec[], side: WallSide, plate: Plate, along: number) {
  const yaw = INWARD_YAW[side]
  return parts.map((part): PartSpec => {
    const point = onWall(side, plate, along + part.at[0], part.at[2])
    const [pitch, turn, roll] = part.rotation ?? [0, 0, 0]
    return { ...part, at: [point.x, part.at[1], point.z], rotation: [pitch, turn + yaw, roll] }
  })
}

function footprintOnWall(side: WallSide, plate: Plate, along: number, size: Prop['size']): Rect {
  const centre = onWall(side, plate, along, size.depth / 2)
  const [width, depth] = isAcrossX(side) ? [size.depth, size.width] : [size.width, size.depth]
  return { ...centre, width: width + PROP_GAP_M, depth: depth + PROP_GAP_M }
}

const deskFootprint = (seat: DeskSlot): Rect => ({
  x: seat.x + (Math.sin(seat.heading) * DESK_REACH) / 2,
  z: seat.z + (Math.cos(seat.heading) * DESK_REACH) / 2,
  width: DESK_CLEAR_M,
  depth: DESK_CLEAR_M
})
const CORNER_PROP_M = 0.55

const at = (parts: readonly PartSpec[], x: number, z: number): PartSpec[] =>
  parts.map((part) => ({ ...part, at: [part.at[0] + x, part.at[1], part.at[2] + z] }))

function shellParts(plate: Plate, colors: CampusRoomColors): PartSpec[] {
  const [xSide, zSide] = BACK_WALL_SIDES
  const grow = { x: outward(xSide) * WALL_THICKNESS_M, z: outward(zSide) * WALL_THICKNESS_M }
  const minX = Math.min(plate.minX, plate.minX + grow.x)
  const maxX = Math.max(plate.maxX, plate.maxX + grow.x)
  const minZ = Math.min(plate.minZ, plate.minZ + grow.z)
  const maxZ = Math.max(plate.maxZ, plate.maxZ + grow.z)
  const edgeX = wallOrigin(xSide, plate).x + grow.x / 2
  const edgeZ = wallOrigin(zSide, plate).z + grow.z / 2
  const rugWidth = plate.maxX - plate.minX - RUG_INSET_M * 2
  const rugDepth = plate.maxZ - plate.minZ - RUG_INSET_M * 2
  return [
    box(
      [(minX + maxX) / 2, -SLAB_THICKNESS_M / 2, (minZ + maxZ) / 2],
      [maxX - minX, SLAB_THICKNESS_M, maxZ - minZ],
      colors.slab
    ),
    ...(rugWidth > 0 && rugDepth > 0
      ? [
          box(
            [(plate.minX + plate.maxX) / 2, 0.006, (plate.minZ + plate.maxZ) / 2],
            [rugWidth, 0.012, rugDepth],
            colors.rug
          )
        ]
      : []),
    // The x-side wall runs on over the shared corner; the z-side one stops at the plate.
    box(
      [edgeX, BACK_WALL_HEIGHT_M / 2, (minZ + maxZ) / 2],
      [WALL_THICKNESS_M, BACK_WALL_HEIGHT_M, maxZ - minZ],
      colors.wall
    ),
    box(
      [(plate.minX + plate.maxX) / 2, BACK_WALL_HEIGHT_M / 2, edgeZ],
      [plate.maxX - plate.minX, BACK_WALL_HEIGHT_M, WALL_THICKNESS_M],
      colors.wall
    )
  ]
}

// The first of `alongs` where the prop stands clear of every desk, or null.
function firstClearAlong(
  side: WallSide,
  plate: Plate,
  prop: Prop,
  desks: readonly Rect[]
): number | null {
  const reach = (wallLength(side, plate) - prop.size.width) / 2 - CORNER_PROP_M
  if (reach < 0) return null
  return (
    [0, reach / 2, -reach / 2, reach].find(
      (along) =>
        !desks.some((desk) => overlaps(footprintOnWall(side, plate, along, prop.size), desk))
    ) ?? null
  )
}

function cornerParts(plate: Plate, desks: readonly Rect[]): PartSpec[] {
  const [xSide, zSide] = BACK_WALL_SIDES
  const inset = CORNER_PROP_M / 2 + PROP_GAP_M
  const cornerX = (sign: number) => (sign < 0 ? plate.minX + inset : plate.maxX - inset)
  const cornerZ = (sign: number) => (sign < 0 ? plate.minZ + inset : plate.maxZ - inset)
  const backCorner = { x: outward(xSide), z: outward(zSide) }
  return [-1, 1].flatMap((xSign) =>
    [-1, 1].flatMap((zSign) => {
      const spot = {
        x: cornerX(xSign),
        z: cornerZ(zSign),
        width: CORNER_PROP_M,
        depth: CORNER_PROP_M
      }
      if (desks.some((desk) => overlaps(spot, desk))) return []
      // The lamp lights the corner where the two walls meet; plants take the others.
      const isBack = xSign === backCorner.x && zSign === backCorner.z
      return at(isBack ? FLOOR_LAMP : PLANT, spot.x, spot.z)
    })
  )
}

// One project's open room: slab, rug, two back walls and its dressing, in floor coordinates.
export function campusRoomParts(floor: FloorGeometry, colors: CampusRoomColors): PartSpec[] {
  const plate = plateOf(floor)
  const desks = floor.rooms.flatMap((room) => room.seats.map(deskFootprint))
  const [chartWall, shelfWall] = BACK_WALL_SIDES
  const wallProp = (side: WallSide, prop: Prop): PartSpec[] => {
    const along = firstClearAlong(side, plate, prop, desks)
    return along === null ? [] : placed(prop.parts, side, plate, along)
  }
  return [
    ...shellParts(plate, colors),
    ...placed(CHART_SCREEN, chartWall, plate, 0),
    ...wallProp(shelfWall, BOOKSHELF),
    ...(floor.depth >= SOFA_MIN_DEPTH_M ? wallProp(chartWall, SOFA) : []),
    ...cornerParts(plate, desks)
  ]
}
