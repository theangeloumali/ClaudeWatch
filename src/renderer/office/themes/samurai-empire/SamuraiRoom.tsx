import { useMemo } from 'react'
import { doorSignPlacement } from '../../logic/room-layout'
import { useSignTexture } from '../../scene/textures'
import { BandedWalls, type WallBand } from '../BandedWalls'
import { firstClear, spotAt } from '../lounge-layout'
import { box, lit, Parts, type PartSpec } from '../parts'
import type { DeskProps, RoomProps, RoomsProps, WallsProps } from '../types'
import { SAMURAI_DESK_PARTS, SAMURAI_TEA_STATION } from './furniture'
import { SAMURAI_MATERIALS as material } from './palette'

// dry-new: mineral infill and cyan rail follow shared camera-aware cutaway heights.
const WALL_BANDS: readonly WallBand[] = [
  {
    name: 'samurai-base',
    color: material.charcoal,
    thickness: 0.14,
    span: () => ({ y: 0.03, scaleY: 0.06 })
  },
  {
    name: 'samurai-infill',
    color: material.mineral,
    thickness: 0.095,
    span: (height) => ({
      y: 0.06 + Math.max(0.01, height - 0.09) / 2,
      scaleY: Math.max(0.01, height - 0.09)
    })
  },
  {
    name: 'samurai-rail',
    color: material.indigo,
    thickness: 0.15,
    span: (height) => ({ y: height - 0.015, scaleY: 0.03 })
  }
]
const DOOR_PARTS: readonly PartSpec[] = [
  ...[-0.6, 0.6].map((across) => box([across, 0.62, 0], [0.09, 1.24, 0.15], material.slate)),
  box([0, 1.265, 0], [1.38, 0.05, 0.21], material.indigo),
  box([0, 1.312, -0.024], [1.54, 0.044, 0.26], material.mineral),
  lit(box([0.605, 0.86, 0.084], [0.035, 0.19, 0.018], material.cyan)),
  lit(box([-0.605, 1.11, 0.086], [0.04, 0.055, 0.02], material.amber))
]

export function SamuraiWalls(props: WallsProps) {
  return <BandedWalls {...props} bands={WALL_BANDS} />
}

export function SamuraiRoomFloors({ rooms }: RoomsProps) {
  const parts = useMemo(
    () =>
      rooms.flatMap((room) => [
        box([room.x, 0.012, room.z], [room.width, 0.012, room.depth], material.mineral),
        box(
          [room.x, 0.02, room.z],
          [Math.min(0.045, room.width), 0.003, room.depth],
          material.slate
        ),
        box(
          [room.x, 0.02, room.z],
          [room.width, 0.003, Math.min(0.045, room.depth)],
          material.slate
        )
      ]),
    [rooms]
  )
  return <Parts parts={parts} />
}

export function SamuraiDoorway({ room }: RoomProps) {
  const place = doorSignPlacement(room)
  return (
    <group position={[room.door.x, 0, room.door.z]} rotation={[0, place.rotationY, 0]}>
      <Parts parts={DOOR_PARTS} />
    </group>
  )
}

export function SamuraiDesk({ slot }: DeskProps) {
  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.heading, 0]}>
      <Parts parts={SAMURAI_DESK_PARTS} />
    </group>
  )
}

export function SamuraiRoomDressing({ room }: RoomProps) {
  const width = 0.56
  const depth = 0.42
  if (room.width < width + 0.3 || room.depth < depth + 0.3) return null
  const spot = firstClear(
    room,
    [-1, 1].flatMap((across) => [-1, 1].map((along) => spotAt(room, across, along, width, depth))),
    room.seats.map((seat) => ({ x: seat.x, z: seat.z, width: 2.8, depth: 2.8 }))
  )
  return spot ? (
    <group name="samurai-room-tea" position={[spot.x, 0, spot.z]}>
      <Parts parts={SAMURAI_TEA_STATION} />
    </group>
  ) : null
}

export function SamuraiRoomSign({ room }: RoomProps) {
  const place = doorSignPlacement(room)
  const texture = useSignTexture(room.label)
  return (
    <group position={[place.x, 1.62, place.z]} rotation={[0, place.rotationY, 0]}>
      <Parts
        parts={[
          box([0, 0, -0.038], [1.83, 0.43, 0.06], material.indigo),
          lit(box([-0.89, 0, 0.002], [0.025, 0.34, 0.016], material.magenta))
        ]}
      />
      <mesh>
        <planeGeometry args={[1.7, 0.35]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  )
}
