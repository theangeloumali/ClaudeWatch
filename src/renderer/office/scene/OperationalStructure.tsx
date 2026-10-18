import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, type Group } from 'three'
import { SIDE_NORMAL, type WallsMode, type WallSide } from '../logic/room-layout'
import { createSideCutaway } from '../logic/facade-cutaway'
import type { FloorGeometry, RoomGeometry } from '../scene-model'
import { Parts } from '../themes/parts'
import type { BuildingExteriorProfile } from '../themes/physical-building-parts'
import type { OfficeTheme } from '../themes/types'
import { floorElevation } from './all-floor-model'
import { SHARED_BATCH } from './mesh-batches'
import {
  perimeterStructureParts,
  roomBoundaryParts,
  slabFasciaParts,
  STRUCTURAL_SIDES
} from './operational-parts'

// dry-new: BuildingWindows owns glazing; this adds supported, camera-aware structural depth.
export function OperationalStructure({
  floor,
  theme,
  profile,
  wallsMode,
  isOverview
}: {
  floor: FloorGeometry
  theme: OfficeTheme
  profile: BuildingExteriorProfile
  wallsMode: WallsMode
  isOverview: boolean
}) {
  const fascia = useMemo(
    () => (isOverview ? [] : slabFasciaParts({ floor, theme })),
    [floor, theme, isOverview]
  )
  const frames = useMemo(
    () =>
      (isOverview ? [] : STRUCTURAL_SIDES).map((side) => ({
        side,
        parts: perimeterStructureParts({ floor, theme, profile, side, isOverview })
      })),
    [floor, theme, profile, isOverview]
  )
  const sides = useRef(new Map<WallSide, Group>())
  const forward = useMemo(() => new Vector3(), [])
  const cutaway = useMemo(() => createSideCutaway<WallSide>(), [])
  useFrame(({ camera }) => {
    camera.getWorldDirection(forward)
    for (const [side, group] of sides.current) {
      const isNear = cutaway.isOpen(side, forward, SIDE_NORMAL[side])
      group.visible = wallsMode === 'up' || (wallsMode === 'cutaway' && !isNear)
    }
  })
  if (isOverview) return null
  return (
    <group
      name={`operational-structure:${floor.floorId}`}
      position={[floor.x, floorElevation(floor), floor.z]}
    >
      <Parts parts={fascia} />
      {frames.map(({ side, parts }) => (
        <group
          key={side}
          name={`structural-frame:${side}`}
          visible={wallsMode !== 'down'}
          ref={(group) => {
            if (group) sides.current.set(side, group)
            else sides.current.delete(side)
          }}
        >
          <Parts parts={parts} />
        </group>
      ))}
    </group>
  )
}

export function OperationalRoomBoundary({
  room,
  theme,
  focusedRoomId,
  isOverview,
  openInteriors
}: {
  room: RoomGeometry
  theme: OfficeTheme
  focusedRoomId?: string | null
  isOverview: boolean
  openInteriors: boolean
}) {
  const isFocused = room.id === focusedRoomId
  const parts = useMemo(
    () => roomBoundaryParts({ room, theme, isFocused, isOverview }),
    [room, theme, isFocused, isOverview]
  )
  const finishBatch = useMemo(
    () => ({ [SHARED_BATCH]: `operational-room-finish:${theme.palette.floor}` }),
    [theme.palette.floor]
  )
  return (
    <group name={`room-boundary:${room.id}`}>
      {/* Upper plates remain see-through so opening every roof cannot conceal lower crews. */}
      {openInteriors && !isOverview && (
        <mesh
          name="room-cutaway-finish"
          position={[room.x, 0.024, room.z]}
          scale={[room.width, 0.008, room.depth]}
          userData={finishBatch}
          raycast={() => undefined}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            color={theme.palette.floor}
            roughness={0.85}
            transparent
            opacity={0.12}
            depthWrite={false}
          />
        </mesh>
      )}
      <Parts parts={parts} />
    </group>
  )
}
