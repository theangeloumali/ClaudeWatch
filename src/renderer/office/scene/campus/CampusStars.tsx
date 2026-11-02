import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'
import type { SceneBox } from '../../logic/camera-bands'

const STAR_COUNT = 420
// Just above the ground plane and under every slab, so buildings hide the stars they stand on.
const STAR_HEIGHT_M = 0.03

// Deterministic, so the sky is the same on every load and in every screenshot.
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

function starGeometry(box: SceneBox): BufferGeometry {
  const random = seededRandom(0x5eed)
  const positions = new Float32Array(STAR_COUNT * 3)
  const colors = new Float32Array(STAR_COUNT * 3)
  for (let index = 0; index < STAR_COUNT; index++) {
    positions.set(
      [
        box.x + (random() - 0.5) * box.width,
        box.minY + STAR_HEIGHT_M,
        box.z + (random() - 0.5) * box.depth
      ],
      index * 3
    )
    const brightness = 0.35 + random() * 0.65
    colors.set([brightness * 0.85, brightness * 0.9, brightness], index * 3)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  return geometry
}

// One static draw: nothing here asks for a frame.
export function CampusStars({ box }: { box: SceneBox }) {
  const geometry = useMemo(() => starGeometry(box), [box])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial size={2} sizeAttenuation={false} vertexColors depthWrite={false} />
    </points>
  )
}
