import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Vector3, type Group } from 'three'
import type { FloorGeometry } from '../scene-model'
import type { ThemePalette } from '../themes/types'
import type { BuildingExteriorProfile } from '../themes/physical-building-parts'
import { SIDE_NORMAL, type WallSide, type WallsMode } from '../logic/room-layout'
import { createSideCutaway } from '../logic/facade-cutaway'
import { SHARED_BATCH } from './mesh-batches'
import { windowParts } from './building-window-parts'

const NO_RAYCAST = () => undefined
const GLASS_OPACITY = 0.14
const OVERVIEW_BAYS_PER_SIDE = 1

// dry-new: far-side window frames retain building shape while camera-facing facades open.
export function BuildingWindows({
  floor,
  palette,
  wallsMode,
  isOverview = false,
  presentation = 'interior',
  exteriorProfile
}: {
  floor: FloorGeometry
  palette: ThemePalette
  wallsMode: WallsMode
  isOverview?: boolean
  presentation?: 'interior' | 'exterior'
  exteriorProfile?: BuildingExteriorProfile
}) {
  const parts = useMemo(
    () => windowParts(floor, isOverview ? OVERVIEW_BAYS_PER_SIDE : undefined, exteriorProfile),
    [floor, isOverview, exteriorProfile]
  )
  const glassColor = exteriorProfile?.glassColor ?? palette.brass
  const glassBatch = useMemo(
    () => ({
      [SHARED_BATCH]: `physical-building-glass:${presentation}:${presentation === 'interior' ? palette.paper : glassColor}`
    }),
    [palette.paper, presentation, glassColor]
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
  return (
    <group>
      {(['north', 'east', 'south', 'west', 'connector'] as const).map((side) => (
        <group
          key={side}
          ref={(group) => {
            if (side === 'connector') return
            if (group) sides.current.set(side, group)
            else sides.current.delete(side)
          }}
        >
          {parts
            .filter((part) => part.side === side && part.kind === 'band')
            .map((part, index) => (
              <mesh
                key={`band:${index}`}
                position={part.position}
                scale={part.size}
                raycast={NO_RAYCAST}
              >
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color={exteriorProfile?.bandColor ?? palette.stone} />
              </mesh>
            ))}
          <group>
            {parts
              .filter((part) => part.side === side && part.kind !== 'band')
              .map((part, index) => (
                <mesh
                  key={`${part.kind}:${index}`}
                  position={part.position}
                  scale={part.size}
                  userData={part.kind === 'glass' ? glassBatch : undefined}
                  raycast={NO_RAYCAST}
                >
                  <boxGeometry args={[1, 1, 1]} />
                  {part.kind === 'glass' && presentation === 'interior' ? (
                    <meshBasicMaterial
                      color={palette.paper}
                      transparent
                      opacity={GLASS_OPACITY}
                      depthWrite={false}
                    />
                  ) : (
                    <meshStandardMaterial
                      color={
                        part.kind === 'glass'
                          ? glassColor
                          : (exteriorProfile?.frameColor ?? palette.lacquer)
                      }
                    />
                  )}
                </mesh>
              ))}
          </group>
        </group>
      ))}
    </group>
  )
}
