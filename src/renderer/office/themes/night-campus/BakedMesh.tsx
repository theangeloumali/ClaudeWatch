import { useMemo } from 'react'
import { fitTransform, type PlacedModel } from './glb-props'

const UNTINTED = '#ffffff'

// Vertex colours carry the Kenney palette; `color` tints it, per instance under BatchedScene.
export function BakedMaterial({ color = UNTINTED }: { color?: string }) {
  return <meshStandardMaterial vertexColors color={color} roughness={0.8} metalness={0.15} />
}

// A baked Kenney part in its fit box.
export function BakedMesh({ part, box, color }: PlacedModel) {
  const fit = useMemo(() => {
    const transform = fitTransform(part, box)
    return { ...transform, rotation: [0, transform.yaw, 0] as [number, number, number] }
  }, [part, box])
  return (
    <mesh
      geometry={part.geometry}
      position={fit.position}
      rotation={fit.rotation}
      scale={fit.scale}
    >
      <BakedMaterial color={color} />
    </mesh>
  )
}
