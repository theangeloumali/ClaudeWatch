import { useMemo } from 'react'
import { FURNITURE_SCALE, GUEST_FURNITURE_SCALE } from '../../../../shared/office/figure-scale'
import { DESK_REACH, doorSignPlacement } from '../../logic/room-layout'
import type { RoomGeometry } from '../../scene-model'
import { BrassRoomSign } from '../BrassKit'
import { firstClear, spotAt } from '../lounge-layout'
import { box, Parts, type PartSpec } from '../parts'
import type { DeskProps, RoomProps, RoomsProps } from '../types'
import { CORPORATE_DESK_PARTS, CORPORATE_LOW_PLANTER_PARTS } from './office-furniture'
import { CORPORATE_MATERIALS as materials, CORPORATE_PALETTE as palette } from './palette'

// dry-new: the shared placement contract needs a slim square portal, not a fantasy arch.
const DOOR_PARTS: readonly PartSpec[] = [
  ...[-0.61, 0.61].map((across) => box([across, 0.59, 0], [0.08, 1.18, 0.12], materials.frame)),
  box([0, 1.22, 0], [1.3, 0.08, 0.12], materials.frame),
  box([0.61, 0.82, 0.075], [0.07, 0.15, 0.025], materials.screen)
]
const TILE_PITCH = 1.5
const PLANTER_WIDTH = 0.52
const PLANTER_INSET = 0.15
const CORNER_SPOTS: readonly [number, number][] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1]
]

function deskFootprints(room: RoomGeometry) {
  return room.seats.flatMap((seat) => {
    const scale = seat.slotId === 'desk_main' ? FURNITURE_SCALE : GUEST_FURNITURE_SCALE
    const across = Math.cos(seat.heading)
    const ahead = Math.sin(seat.heading)
    return CORPORATE_DESK_PARTS.filter((part) => part.at[2] > DESK_REACH / 2).map((part) => ({
      x: seat.x + (part.at[0] * across + part.at[2] * ahead) * scale,
      z: seat.z + (-part.at[0] * ahead + part.at[2] * across) * scale,
      width: (Math.abs(across) * part.size[0] + Math.abs(ahead) * part.size[2]) * scale,
      depth: (Math.abs(ahead) * part.size[0] + Math.abs(across) * part.size[2]) * scale
    }))
  })
}

export function CorporateRoomFloors({ rooms }: RoomsProps) {
  const parts = useMemo(
    () =>
      rooms.flatMap((room) => {
        const rows = Math.max(1, Math.ceil(room.depth / TILE_PITCH))
        return [
          box(
            [room.x, 0.012, room.z],
            [room.width, 0.012, room.depth],
            room.kind === 'team' ? palette.floor : palette.paper
          ),
          ...Array.from({ length: rows - 1 }, (_, row) =>
            box(
              [room.x, 0.019, room.z - room.depth / 2 + ((row + 1) * room.depth) / rows],
              [room.width, 0.002, 0.015],
              materials.concrete
            )
          )
        ]
      }),
    [rooms]
  )
  return <Parts parts={parts} />
}

export function CorporateDoorway({ room }: RoomProps) {
  const place = doorSignPlacement(room)
  return (
    <group position={[room.door.x, 0, room.door.z]} rotation={[0, place.rotationY, 0]}>
      <Parts parts={DOOR_PARTS} />
    </group>
  )
}

export function CorporateDesk({ slot }: DeskProps) {
  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.heading, 0]}>
      <Parts parts={CORPORATE_DESK_PARTS} />
    </group>
  )
}

export function CorporateRoomDressing({ room }: RoomProps) {
  const canFit = Math.min(room.width, room.depth) >= PLANTER_WIDTH + PLANTER_INSET * 2
  const spot = canFit
    ? firstClear(
        room,
        CORNER_SPOTS.map(([across, along]) =>
          spotAt(room, across, along, PLANTER_WIDTH, PLANTER_WIDTH)
        ),
        deskFootprints(room)
      )
    : null
  return spot ? (
    <group name="corporate-room-planter" position={[spot.x, 0, spot.z]}>
      <Parts parts={CORPORATE_LOW_PLANTER_PARTS} />
    </group>
  ) : null
}

export function CorporateRoomSign({ room }: RoomProps) {
  const place = doorSignPlacement(room)
  return (
    <>
      <group position={[place.x, 0, place.z]} rotation={[0, place.rotationY, 0]}>
        <Parts
          parts={[
            box([0, 1.62, -0.045], [1.8, 0.43, 0.07], materials.frame),
            box([-0.85, 1.62, 0], [0.025, 0.32, 0.012], palette.wood)
          ]}
        />
      </group>
      <BrassRoomSign room={room} />
    </>
  )
}
