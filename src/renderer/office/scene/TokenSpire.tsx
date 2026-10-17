import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Mesh } from 'three'
import { buildingPlaces, type BuildingPlaces, type BuildingRoof } from '../logic/building-place'
import { cityClock } from '../logic/city-clock'
import { SPIRE_BASE_GAP_M, SPIRE_MAX_M } from '../logic/token-spires'
import type { FloorGeometry } from '../scene-model'
import { moduleFrames, spireModules } from '../themes/spire-parts'
import type { OfficeTheme, ThemePalette } from '../themes/types'
import { UNIT_SHAPES } from '../themes/unit-parts'
import { buildingGroupName } from './all-floor-model'
import { BatchedScene } from './BatchedScene'
import { spireBatchRevision, type CitySpire } from './batch-revision'
import { CompanyLens } from './CompanyLens'
import { Matte } from './InstancedParts'

// How much of the tallest spire stands now: the live top above the crown, eased.
export function spireShare(
  places: Pick<BuildingPlaces, 'topAt' | 'roofOf'>,
  buildingId: string,
  nowMs: number,
  isPinned: boolean
): number {
  const roof = places.roofOf(buildingId)
  const top = places.topAt(buildingId, nowMs, isPinned)
  if (!roof || !top) return 0
  return Math.max(0, top.y - roof.crown.y - SPIRE_BASE_GAP_M) / SPIRE_MAX_M
}

// Unit boxes, placed each frame from the roof the shell gives the place store; only a growing
// module moves. Only the stages reached today mount: a hidden module still costs triangles.
export function TokenSpire({
  buildingId,
  theme,
  stage
}: {
  buildingId: string
  theme: OfficeTheme
  stage: number
}) {
  const modules = useMemo(() => spireModules(theme).slice(0, stage), [theme, stage])
  const meshes = useRef<(Mesh | null)[]>([])
  const drawn = useRef<{ roof: BuildingRoof | null; share: number; stage: number } | null>(null)
  useFrame(() => {
    const roof = buildingPlaces.roofOf(buildingId)
    const share = spireShare(buildingPlaces, buildingId, cityClock.now(), cityClock.isPinned())
    // The stage counts too: the frame feed can move the share before React mounts the module.
    const last = drawn.current
    if (last?.roof === roof && last.share === share && last.stage === stage) return
    drawn.current = { roof, share, stage }
    const baseY = (roof?.crown.y ?? 0) + SPIRE_BASE_GAP_M
    const frames = roof ? moduleFrames(share * SPIRE_MAX_M, baseY - roof.deck.y) : []
    meshes.current.forEach((mesh, index) => {
      const frame = frames[index]
      if (!mesh) return
      mesh.visible = Boolean(roof && frame)
      if (!roof || !frame) return
      mesh.position.set(roof.crown.x, baseY + frame.y, roof.crown.z)
      mesh.scale.y = frame.height
    })
  })
  return (
    <group name={`token-spire:${buildingId}`}>
      {modules.map((part, index) => (
        <mesh
          key={index}
          ref={(mesh) => {
            meshes.current[index] = mesh
          }}
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

// Every office's spire in one batch of its own, so a stage reached rebuilds only it (+1 draw).
// A lens tints only its own batch, so this one carries one to give spires their company's hue.
export function TokenSpires({
  spires,
  floors,
  palette
}: {
  spires: readonly CitySpire[]
  floors: readonly FloorGeometry[]
  palette: ThemePalette
}) {
  return (
    <BatchedScene revision={spireBatchRevision(spires)}>
      {spires.map((spire) => (
        <group key={spire.buildingId} name={buildingGroupName(spire.buildingId)}>
          <TokenSpire {...spire} />
        </group>
      ))}
      <CompanyLens floors={floors} palette={palette} />
    </BatchedScene>
  )
}
