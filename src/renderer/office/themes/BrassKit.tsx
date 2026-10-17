export { BrassRoomDressing } from './BrassRoomDressing'
export { BrassWalls } from './BrassWalls'
import { STEAM } from '../office-palette'
import { Elevator } from './BrassElevator'
import { useSignTexture } from '../scene/textures'
import { doorSignPlacement, DESK_REACH } from '../logic/room-layout'
import { Matte } from '../scene/InstancedParts'
import { Batch, Box } from './primitives'
import type { DeskProps, FloorProps, RoomProps, RoomsProps } from './types'

export function BrassSlab({ floor }: FloorProps) {
  return (
    <>
      <Box at={[0, -0.15, 0]} size={[floor.width + 1, 0.3, floor.depth + 1]} color={STEAM.slab} />
      <Box
        at={[0, 0, floor.corridor.z]}
        size={[floor.width, 0.008, floor.corridor.width]}
        color={STEAM.iron}
      />
    </>
  )
}

export function BrassRoomFloors({ rooms }: RoomsProps) {
  return (
    <>
      {rooms.map((room) => (
        <Box
          key={room.id}
          at={[room.x, 0.008, room.z]}
          size={[room.width, 0.008, room.depth]}
          color={room.kind === 'team' ? STEAM.ironLight : STEAM.floorWood}
        />
      ))}
    </>
  )
}

export function BrassDoorway({ room }: RoomProps) {
  const sign = doorSignPlacement(room)
  return (
    <group position={[sign.x, 0, sign.z]} rotation={[0, sign.rotationY, 0]}>
      <mesh position={[0, 0.7, 0]}>
        <torusGeometry args={[0.58, 0.07, 6, 16, Math.PI]} />
        <Matte color={STEAM.brass} />
      </mesh>
      <Batch
        color={STEAM.brass}
        points={[-0.58, 0.58].map((x) => ({ x, y: 0.35, z: 0, rotationY: 0 }))}
      >
        <cylinderGeometry args={[0.07, 0.07, 0.7, 8]} />
      </Batch>
      <Batch
        color={STEAM.rivetLight}
        glow
        points={[-0.58, 0.58].map((x) => ({ x, y: 0.72, z: 0, rotationY: 0 }))}
      >
        <sphereGeometry args={[0.06, 8, 6]} />
      </Batch>
    </group>
  )
}

export function BrassDesk({ slot }: DeskProps) {
  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.heading, 0]}>
      <Box at={[0, 0.31, DESK_REACH]} size={[1.2, 0.62, 0.62]} color={STEAM.darkWood} />
      <Box at={[0, 0.8, DESK_REACH + 0.1]} size={[0.414, 0.36, 0.36]} color={STEAM.crtBody} />
      <Box
        at={[0, 0.8, DESK_REACH - 0.085]}
        size={[0.324, 0.259, 0.01]}
        color={STEAM.crtScreen}
        glow
      />
      <mesh position={[0.42, 0.8, DESK_REACH + 0.12]}>
        <cylinderGeometry args={[0.02, 0.05, 0.36, 6]} />
        <Matte color={STEAM.brass} />
      </mesh>
      <mesh position={[0.42, 1, DESK_REACH + 0.12]}>
        <coneGeometry args={[0.11, 0.12, 8]} />
        <Matte color={STEAM.lampGlow} glow />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.2, 0.16, 0.32, 10]} />
        <Matte color={STEAM.copper} />
      </mesh>
    </group>
  )
}

export function BrassRoomSign({ room }: RoomProps) {
  const sign = doorSignPlacement(room)
  const texture = useSignTexture(room.label)
  return (
    <mesh position={[sign.x, 1.62, sign.z]} rotation={[0, sign.rotationY, 0]}>
      <planeGeometry args={[1.7, 0.35]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}

export function BrassElevator(props: FloorProps) {
  return <Elevator {...props} />
}
