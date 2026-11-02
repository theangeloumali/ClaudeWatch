import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'
import type { SceneBox } from '../../logic/camera-bands'
import { campusGlowMaterial } from './campus-shaders'

const STAR_COUNT = 420
// Just above the ground plane and under every slab, so buildings hide the stars they stand on.
const STAR_HEIGHT_M = 0.03

// Each star twinkles at its own rate and phase, both from its `phase` attribute.
const STAR_VERTEX = /* glsl */ `
uniform float uTime;
attribute float phase;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = color;
  float twinkle = 0.5 + 0.5 * sin(uTime * (0.8 + phase * 2.2) + phase * 6.2832);
  vAlpha = 0.35 + 0.65 * twinkle;
  gl_PointSize = 2.0 + twinkle;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

// Square points, so a 2px star stays crisp rather than a soft dot.
const STAR_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(vColor * vAlpha, 1.0);
  #include <colorspace_fragment>
}
`

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
  const phases = new Float32Array(STAR_COUNT)
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
    phases[index] = random()
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.setAttribute('phase', new BufferAttribute(phases, 1))
  return geometry
}

// One draw; the twinkle runs in the shader on the Campus clock, so nothing here asks for a frame.
export function CampusStars({ box }: { box: SceneBox }) {
  const geometry = useMemo(() => starGeometry(box), [box])
  const material = useMemo(() => campusGlowMaterial(STAR_VERTEX, STAR_FRAGMENT), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  return <points geometry={geometry} material={material} frustumCulled={false} />
}
