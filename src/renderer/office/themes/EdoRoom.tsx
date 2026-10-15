import { useMemo } from 'react'
import { DoubleSide } from 'three'
import { doorSignPlacement } from '../logic/room-layout'
import { signTexture } from '../scene/textures'
import { Matte } from '../scene/InstancedParts'
import { EDO } from './palettes'
import { EDO_DESK_PARTS } from './edo-computer-parts'
import { Parts } from './parts'
import { Batch, Box, Cylinder, Lantern } from './primitives'
import type { DeskProps, FloorProps, RoomProps } from './types'

export function Torii({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
      <Batch
        color={EDO.lacquer}
        points={[-0.65, 0.65].map((x) => ({ x, y: 0.75, z: 0, rotationY: 0 }))}
      >
        <cylinderGeometry args={[0.07, 0.095, 1.5, 8]} />
      </Batch>
      <Box at={[0, 1.55, 0]} size={[1.75, 0.13, 0.2]} color={EDO.lacquer} />
      <Box at={[0, 1.28, 0]} size={[1.6, 0.08, 0.12]} color={EDO.wood} />
      <Batch
        color={EDO.brass}
        points={[-0.65, 0.65].map((x) => ({ x, y: 1.28, z: 0.08, rotationY: 0 }))}
      >
        <sphereGeometry args={[0.035, 6, 4]} />
      </Batch>
    </group>
  )
}

export function EdoDoorway({ room }: RoomProps) {
  const sign = doorSignPlacement(room)
  return (
    <group position={[room.door.x, 0, room.door.z]} rotation={[0, sign.rotationY, 0]}>
      <Torii scale={0.8} />
      <Batch
        color={EDO.copper}
        points={[-0.24, 0, 0.24].map((x) => ({ x, y: 1, z: 0, rotationY: 0 }))}
      >
        <boxGeometry args={[0.22, 0.45, 0.025]} />
      </Batch>
    </group>
  )
}

export function EdoDesk({ slot }: DeskProps) {
  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.heading, 0]}>
      <Parts parts={EDO_DESK_PARTS} />
    </group>
  )
}

function Sakura({ small = false }: { small?: boolean }) {
  return (
    <group scale={small ? 0.22 : 1}>
      <Cylinder at={[0, 1, 0]} radius={0.12} height={2} color={EDO.wood} />
      <Batch
        color={EDO.blossom}
        points={[
          [0, 2.3, 0],
          [-0.55, 2, 0.3],
          [0.5, 2.1, -0.3]
        ].map(([x, y, z]) => ({ x, y, z, rotationY: 0 }))}
      >
        <icosahedronGeometry args={[0.85, 0]} />
      </Batch>
    </group>
  )
}

export function EdoRoomDressing({ room }: RoomProps) {
  return (
    <group position={[room.x - room.width / 2 + 0.55, 0, room.z - room.depth / 2 + 0.55]}>
      <Box at={[0, 0.14, 0]} size={[0.48, 0.28, 0.48]} color={EDO.wood} />
      <group position={[0, 0.28, 0]}>
        <Sakura small />
      </group>
      <Lantern at={[0.8, 1.35, 0]} color={EDO.glow} frame={EDO.brass} />
      <Cylinder at={[1.5, 0.48, 0]} radius={0.25} height={0.95} color={EDO.brass} />
      <Cylinder at={[1.5, 1.05, 0]} radius={0.06} height={0.2} color={EDO.copper} />
      <mesh position={[1.5, 0.72, 0.26]}>
        <sphereGeometry args={[0.09, 8, 6]} />
        <Matte color={EDO.paper} />
      </mesh>
    </group>
  )
}

export function EdoRoomSign({ room }: RoomProps) {
  const place = doorSignPlacement(room)
  const texture = useMemo(() => signTexture(room.label), [room.label])
  return (
    <group
      position={[
        place.x + Math.cos(place.rotationY) * 0.8,
        1,
        place.z - Math.sin(place.rotationY) * 0.8
      ]}
      rotation={[0, place.rotationY, 0]}
    >
      <Box size={[0.3, 1.05, 0.08]} color={EDO.wood} />
      <mesh position={[0, 0, 0.045]} rotation={[0, 0, -Math.PI / 2]}>
        <planeGeometry args={[0.9, 0.24]} />
        <meshBasicMaterial map={texture} side={DoubleSide} />
      </mesh>
    </group>
  )
}

export function EdoElevator({ floor }: FloorProps) {
  return (
    <group position={[floor.elevator.x, 0, floor.elevator.z]}>
      <Box at={[0, 0.04, 0]} size={[1.8, 0.08, 1.8]} color={EDO.brass} />
      <Batch
        color={EDO.wood}
        points={[-0.8, 0.8].flatMap((x) => [-0.8, 0.8].map((z) => ({ x, y: 1, z, rotationY: 0 })))}
      >
        <boxGeometry args={[0.09, 2, 0.09]} />
      </Batch>
      <Box at={[0, 2, 0]} size={[2, 0.18, 2]} color={EDO.lacquer} />
      <Lantern at={[0, 1.7, 0]} color={EDO.glow} frame={EDO.brass} />
    </group>
  )
}
