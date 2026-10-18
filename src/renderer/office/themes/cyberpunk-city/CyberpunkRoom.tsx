import { useMemo } from 'react'
import { doorSignPlacement } from '../../logic/room-layout'
import { firstClear, spotAt } from '../lounge-layout'
import { BrassRoomSign } from '../BrassKit'
import { Parts, box } from '../parts'
import type { DeskProps, RoomProps, RoomsProps } from '../types'
import { CYBERPUNK_DESK } from './furniture'
import { CYBERPUNK_PALETTE as palette } from './palette'
import { SHARED_BATCH } from '../../scene/mesh-batches'

const DOOR_GLASS_BATCH = { [SHARED_BATCH]: 'cyberpunk-door-glass' }

const DOOR_FRAME = [
  ...[-0.65, 0.65].map((across) => box([across, 1.025, 0], [0.07, 2.05, 0.13], palette.brass)),
  box([0, 2.09, 0], [1.37, 0.08, 0.13], palette.ink),
  box([0.65, 1.25, 0.075], [0.035, 0.13, 0.025], palette.glow)
]
const TOOL_CABINET = [
  box([0, 0.27, 0], [0.38, 0.54, 0.3], palette.ink),
  ...[0, 1, 2].map((drawer) =>
    box([0, 0.13 + drawer * 0.145, 0.158], [0.31, 0.12, 0.015], palette.brass)
  ),
  box([0, 0.557, 0], [0.42, 0.034, 0.34], palette.wood)
]

export function CyberpunkRoomFloors({ rooms }: RoomsProps) {
  const parts = useMemo(
    () =>
      rooms.flatMap((room) => [
        box([room.x, 0.012, room.z], [room.width, 0.012, room.depth], palette.floor),
        box([room.x, 0.02, room.z], [Math.min(room.width, 0.04), 0.004, room.depth], palette.brass)
      ]),
    [rooms]
  )
  return <Parts parts={parts} />
}

export function CyberpunkDoorway({ room }: RoomProps) {
  const place = doorSignPlacement(room)
  return (
    <group position={[room.door.x, 0, room.door.z]} rotation={[0, place.rotationY, 0]}>
      <Parts parts={DOOR_FRAME} />
      {/* An open sliding leaf stays outside the traversable doorway. */}
      <mesh position={[0.91, 1.015, 0]} scale={[0.42, 1.93, 0.018]} userData={DOOR_GLASS_BATCH}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color={palette.glow}
          transparent
          opacity={0.22}
          roughness={0.8}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

export function CyberpunkDesk({ slot }: DeskProps) {
  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.heading, 0]}>
      <Parts parts={CYBERPUNK_DESK} />
    </group>
  )
}

export function CyberpunkRoomDressing({ room }: RoomProps) {
  if (Math.min(room.width, room.depth) < 0.85) return null
  const spot = firstClear(
    room,
    [-1, 1].flatMap((across) => [-1, 1].map((along) => spotAt(room, across, along, 0.42, 0.34))),
    room.seats.map((seat) => ({ x: seat.x, z: seat.z, width: 2.8, depth: 2.8 }))
  )
  return spot ? (
    <group position={[spot.x, 0, spot.z]}>
      <Parts parts={TOOL_CABINET} />
    </group>
  ) : null
}

export function CyberpunkRoomSign({ room }: RoomProps) {
  return <BrassRoomSign room={room} />
}
