import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Mesh } from 'three'
import { buildingPlace, type BuildingPlace, type PlaceTop } from '../logic/building-place'
import { cityClock } from '../logic/city-clock'
import { SPIRE_BASE_GAP_M, SPIRE_MAX_M } from '../logic/token-spires'
import { moduleFrames, spireModules } from '../themes/spire-parts'
import type { OfficeTheme } from '../themes/types'
import { UNIT_SHAPES } from '../themes/unit-parts'
import { Matte } from './InstancedParts'

// How much of the tallest spire stands now: the live roof above the crown, eased and capped.
export function spireShare(
  place: BuildingPlace,
  crownTopY: number,
  nowMs: number,
  isPinned: boolean
): number {
  const top = place.topAt(nowMs, isPinned)
  if (!top) return 0
  return Math.max(0, top.y - crownTopY - SPIRE_BASE_GAP_M) / SPIRE_MAX_M
}

// Unit boxes inside the shell's batch (+0 draws); only a growing module uploads its matrix.
// Only the stages reached today mount: a hidden module still costs its triangles in the batch.
export function TokenSpire({
  buildingId,
  deck,
  roof,
  theme,
  stage
}: {
  buildingId: string
  deck: PlaceTop
  roof: PlaceTop
  theme: OfficeTheme
  stage: number
}) {
  const baseY = roof.y + SPIRE_BASE_GAP_M
  const modules = useMemo(() => spireModules(theme).slice(0, stage), [theme, stage])
  const meshes = useRef<(Mesh | null)[]>([])
  useFrame(() => {
    const share = spireShare(
      buildingPlace(buildingId),
      roof.y,
      cityClock.now(),
      cityClock.isPinned()
    )
    const frames = moduleFrames(share * SPIRE_MAX_M, baseY - deck.y)
    meshes.current.forEach((mesh, stage) => {
      const frame = frames[stage]
      if (!mesh) return
      mesh.visible = frame !== null
      if (!frame) return
      mesh.position.y = baseY + frame.y
      mesh.scale.y = frame.height
    })
  })
  return (
    <group name={`token-spire:${buildingId}`}>
      {modules.map((part, stage) => (
        <mesh
          key={stage}
          ref={(mesh) => {
            meshes.current[stage] = mesh
          }}
          position={[roof.x, baseY + part.at[1], roof.z]}
          scale={part.size}
          visible={false}
        >
          {UNIT_SHAPES.box}
          <Matte color={part.color} />
        </mesh>
      ))}
    </group>
  )
}
