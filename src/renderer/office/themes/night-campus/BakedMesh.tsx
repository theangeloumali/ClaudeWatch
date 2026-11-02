import { fitTransform, type PlacedModel } from './glb-props'

const UNTINTED = '#ffffff'

// A baked Kenney part in its fit box. Its vertex colours carry the model's own palette; the
// material colour tints it, and BatchedScene applies that colour per instance.
export function BakedMesh({ part, box, color = UNTINTED }: PlacedModel) {
  const fit = fitTransform(part, box)
  return (
    <mesh
      geometry={part.geometry}
      position={fit.position}
      rotation={[0, fit.yaw, 0]}
      scale={fit.scale}
    >
      <meshStandardMaterial vertexColors color={color} roughness={0.8} metalness={0.15} />
    </mesh>
  )
}
