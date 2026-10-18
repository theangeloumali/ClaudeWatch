import type { FloorGeometry } from '../scene-model'
import type { ThemePalette } from '../themes/types'
import { SHARED_BATCH } from './mesh-batches'

const CUTAWAY_GLASS = { [SHARED_BATCH]: 'cutaway-floor-glass' }

// Open ceilings expose lower workers; the translucent surface retains the actual floor position.
export function CutawaySlab({ floor, palette }: { floor: FloorGeometry; palette: ThemePalette }) {
  return (
    <>
      <mesh
        name="floor-cutaway-surface"
        position={[0, -0.025, 0]}
        scale={[floor.width, 0.05, floor.depth]}
        userData={CUTAWAY_GLASS}
        raycast={() => undefined}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color={palette.paper}
          transparent
          opacity={0.035}
          depthWrite={false}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[(side * floor.width) / 2, 0, 0]} scale={[0.14, 0.18, floor.depth]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={palette.brass} />
          </mesh>
          <mesh position={[0, 0, (side * floor.depth) / 2]} scale={[floor.width, 0.18, 0.14]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={palette.brass} />
          </mesh>
        </group>
      ))}
    </>
  )
}
