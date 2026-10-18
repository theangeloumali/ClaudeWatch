import { useMemo } from 'react'
import { STEAM } from '../office-palette'
import type { FloorGeometry } from '../scene-model'
import type { InstancePlacement } from '../scene/instancing'
import { InstancedParts, Matte } from '../scene/InstancedParts'
import { useSignTexture } from '../scene/textures'

const CAGE = { size: 1.8, height: 2.4, bar: 0.035, barsPerSide: 4 }

// A brass birdcage lift: vertical bars on every side, a solid floor and roof ring.
export function Elevator({ floor }: { floor: FloorGeometry }) {
  const bars = useMemo(() => {
    const half = CAGE.size / 2
    const placements: InstancePlacement[] = []
    for (let index = 0; index <= CAGE.barsPerSide; index += 1) {
      const offset = -half + (index / CAGE.barsPerSide) * CAGE.size
      for (const [dx, dz] of [
        [offset, -half],
        [offset, half],
        [-half, offset],
        [half, offset]
      ]) {
        placements.push({
          x: floor.elevator.x + dx,
          y: CAGE.height / 2,
          z: floor.elevator.z + dz,
          rotationY: 0
        })
      }
    }
    return placements
  }, [floor.elevator.x, floor.elevator.z])

  // The sign faces the corridor.
  const towardCorridor = floor.elevator.z <= floor.corridor.z ? 1 : -1
  const sign = useSignTexture(`Lift, floor ${floor.plate}`)
  return (
    <group>
      <InstancedParts placements={bars}>
        <cylinderGeometry args={[CAGE.bar, CAGE.bar, CAGE.height, 6]} />
        <Matte color={STEAM.brass} />
      </InstancedParts>
      {[0.05, CAGE.height].map((y) => (
        <mesh key={y} position={[floor.elevator.x, y, floor.elevator.z]}>
          <boxGeometry args={[CAGE.size + 0.12, 0.1, CAGE.size + 0.12]} />
          <Matte color={STEAM.copper} />
        </mesh>
      ))}
      <mesh
        position={[
          floor.elevator.x,
          CAGE.height + 0.35,
          floor.elevator.z + towardCorridor * (CAGE.size / 2)
        ]}
        rotation={[0, towardCorridor > 0 ? 0 : Math.PI, 0]}
      >
        <planeGeometry args={[1.5, 0.31]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
    </group>
  )
}
