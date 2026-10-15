import type { FloorGeometry, RoomGeometry } from '../scene-model'
import {
  doorSide,
  ROOM_DOOR_WIDTH,
  roomWallSegments,
  SIDE_NORMAL,
  type WallSide
} from '../logic/room-layout'
import { box, cylinder, SIDES, turned, type PartSpec } from '../themes/parts'
import type { BuildingExteriorProfile } from '../themes/physical-building-parts'
import type { OfficeTheme } from '../themes/types'
import { PHYSICAL_STOREY_HEIGHT } from './all-floor-model'

export const STRUCTURAL_SIDES = ['north', 'east', 'south', 'west'] as const
const COLUMN_WIDTH = 0.16
const FASCIA_HEIGHT = 0.12
const BEAM_HEIGHT = 0.2
const MAX_RAFTER_REACH = 1.2
const ROOM_INLAY_Y = 0.034

// dry-new: existing glazing/crowns have no exposed load-bearing frame or slab-edge fascia.
export function slabFasciaParts({
  floor,
  theme
}: {
  floor: FloorGeometry
  theme: OfficeTheme
}): PartSpec[] {
  return STRUCTURAL_SIDES.flatMap((side) => {
    const normal = SIDE_NORMAL[side]
    const isAlongX = normal.z !== 0
    const width = Math.min(COLUMN_WIDTH, floor.width / 4, floor.depth / 4)
    const x = normal.x * (floor.width / 2 - width / 2)
    const z = normal.z * (floor.depth / 2 - width / 2)
    return [
      box(
        [x, -FASCIA_HEIGHT, z],
        isAlongX ? [floor.width, FASCIA_HEIGHT, width] : [width, FASCIA_HEIGHT, floor.depth],
        theme.palette.stone
      ),
      box(
        [x, -FASCIA_HEIGHT / 2, z],
        isAlongX ? [floor.width, 0.018, width] : [width, 0.018, floor.depth],
        theme.palette.lacquer
      )
    ]
  })
}

export function perimeterStructureParts({
  floor,
  theme,
  profile,
  side,
  isOverview
}: {
  floor: FloorGeometry
  theme: OfficeTheme
  profile: BuildingExteriorProfile
  side: WallSide
  isOverview: boolean
}): PartSpec[] {
  const normal = SIDE_NORMAL[side]
  const isAlongX = normal.z !== 0
  const span = isAlongX ? floor.width : floor.depth
  const crossSpan = isAlongX ? floor.depth : floor.width
  const columnWidth = Math.min(COLUMN_WIDTH, span / 4, crossSpan / 4)
  const entrance = floor.entrance ?? { x: floor.x, z: floor.z + floor.depth / 2 }
  const columnEnvelope = columnWidth * 1.35
  const doorWidth =
    profile.entranceFloorId === floor.floorId ? profile.entranceWidth + columnEnvelope * 2 : 0
  const segments = roomWallSegments(
    { ...floor, id: floor.floorId, door: entrance },
    doorWidth
  ).filter((segment) => segment.normalX === normal.x && segment.normalZ === normal.z)
  const columnShape = ['quiet-grove', 'brass-workshop'].includes(theme.id) ? cylinder : box
  const fittingColor = theme.id === 'brass-workshop' ? theme.palette.copper : theme.palette.brass
  const parts = segments.flatMap((segment) => {
    const offsets = isOverview ? SIDES : [-1, 0, 1]
    return offsets.flatMap((offset) => {
      const along = offset * Math.max(0, (segment.length - columnEnvelope) / 2)
      const x = segment.x - floor.x + (isAlongX ? along : (-normal.x * columnEnvelope) / 2)
      const z = segment.z - floor.z + (isAlongX ? (-normal.z * columnEnvelope) / 2 : along)
      return [
        columnShape(
          [x, PHYSICAL_STOREY_HEIGHT / 2, z],
          [columnWidth, PHYSICAL_STOREY_HEIGHT, columnWidth],
          profile.frameColor
        ),
        box([x, 0.08, z], [columnEnvelope, 0.16, columnEnvelope], theme.palette.stone),
        box(
          [x, PHYSICAL_STOREY_HEIGHT - 0.3, z],
          [columnWidth * 1.2, 0.08, columnWidth * 1.2],
          fittingColor
        )
      ]
    })
  })
  const edgeX = normal.x * (floor.width / 2 - columnWidth / 2)
  const edgeZ = normal.z * (floor.depth / 2 - columnWidth / 2)
  const beamY = PHYSICAL_STOREY_HEIGHT - BEAM_HEIGHT / 2
  const rafterReach = Math.min(MAX_RAFTER_REACH, crossSpan * 0.12)
  parts.push(
    box(
      [edgeX, beamY, edgeZ],
      isAlongX ? [span, BEAM_HEIGHT, columnWidth] : [columnWidth, BEAM_HEIGHT, span],
      profile.frameColor
    )
  )
  // Short rear rafters expose support without putting a crossbar over central monitor sight lines.
  parts.push(
    box(
      [
        edgeX - (normal.x * rafterReach) / 2,
        beamY - BEAM_HEIGHT,
        edgeZ - (normal.z * rafterReach) / 2
      ],
      isAlongX ? [columnWidth, BEAM_HEIGHT, rafterReach] : [rafterReach, BEAM_HEIGHT, columnWidth],
      profile.frameColor
    )
  )
  return parts
}

// dry-new: theme floor kits supply finishes, but have no navigation-linked boundary emphasis.
export function roomBoundaryParts({
  room,
  theme,
  isFocused,
  isOverview
}: {
  room: RoomGeometry
  theme: OfficeTheme
  isFocused: boolean
  isOverview: boolean
}): PartSpec[] {
  if (isOverview && !isFocused) return []
  const inlayWidth = Math.min(isFocused ? 0.085 : 0.035, room.width / 8, room.depth / 8)
  const edgeColor = isFocused ? theme.palette.lacquer : theme.palette.wood
  const parts = roomWallSegments(room).map((segment) => {
    const isAlongX = segment.normalZ !== 0
    return box(
      [
        segment.x - (segment.normalX * inlayWidth) / 2,
        ROOM_INLAY_Y,
        segment.z - (segment.normalZ * inlayWidth) / 2
      ],
      isAlongX ? [segment.length, 0.008, inlayWidth] : [inlayWidth, 0.008, segment.length],
      edgeColor
    )
  })
  const doorNormal = SIDE_NORMAL[doorSide(room)]
  const heading = Math.atan2(doorNormal.x, doorNormal.z)
  const doorSpan = doorNormal.z === 0 ? room.depth : room.width
  const doorOffset = doorNormal.z === 0 ? room.door.z - room.z : room.door.x - room.x
  const thresholdWidth = Math.max(0, Math.min(ROOM_DOOR_WIDTH, doorSpan - Math.abs(doorOffset) * 2))
  parts.push(
    turned(
      box(
        [room.door.x, ROOM_INLAY_Y + 0.008, room.door.z],
        [thresholdWidth, 0.012, isFocused ? 0.28 : 0.16],
        theme.id === 'quiet-grove' ? theme.palette.wood : theme.palette.brass
      ),
      [0, heading, 0]
    )
  )
  if (isFocused) {
    for (const across of SIDES) {
      for (const along of SIDES) {
        parts.push(
          box(
            [
              room.x + across * (room.width / 2 - inlayWidth),
              ROOM_INLAY_Y + 0.012,
              room.z + along * (room.depth / 2 - inlayWidth)
            ],
            [inlayWidth * 2, 0.014, inlayWidth * 2],
            theme.palette.paper
          )
        )
      }
    }
  }
  return parts
}
