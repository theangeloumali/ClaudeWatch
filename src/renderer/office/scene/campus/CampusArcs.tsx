import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry, Color } from 'three'
import type { CampusGeometry, CampusSpoke } from '../../logic/campus-geometry'
import { arcPoints } from '../../logic/campus-motion'
import { ARC_RISE_M, ARC_ROOM_END_Y_M } from '../../logic/campus-packets'
import { campusGlowMaterial } from './campus-shaders'

const ARC_SEGMENTS = 32

// `along` runs 0 at the room to 1 at the core; dashes travel inward, each arc on its own phase.
const ARC_VERTEX = /* glsl */ `
attribute float along;
attribute float phase;
varying vec3 vColor;
varying float vAlong;
varying float vPhase;
void main() {
  vColor = color;
  vAlong = along;
  vPhase = phase;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

// A faint line with a lit dash; a memory flash lights the whole arc.
const ARC_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uFlash;
varying vec3 vColor;
varying float vAlong;
varying float vPhase;
void main() {
  float dash = smoothstep(0.75, 1.0, fract(vAlong * 2.0 - uTime * 0.35 + vPhase));
  float lit = 0.35 + 0.9 * dash + 0.8 * uFlash;
  gl_FragColor = vec4(vColor * lit, 1.0);
  #include <colorspace_fragment>
}
`

function arcGeometry(
  spokes: readonly CampusSpoke[],
  chipOf: (spoke: CampusSpoke) => string,
  core: { x: number; y: number; z: number }
): BufferGeometry | null {
  if (spokes.length === 0) return null
  const vertexCount = spokes.length * ARC_SEGMENTS * 2
  const positions = new Float32Array(vertexCount * 3)
  const colors = new Float32Array(vertexCount * 3)
  const along = new Float32Array(vertexCount)
  const phases = new Float32Array(vertexCount)
  const tint = new Color()
  let vertex = 0
  spokes.forEach((spoke, index) => {
    tint.set(chipOf(spoke))
    const points = arcPoints(
      { x: spoke.from.x, y: ARC_ROOM_END_Y_M, z: spoke.from.z },
      core,
      ARC_RISE_M,
      ARC_SEGMENTS
    )
    for (let segment = 0; segment < ARC_SEGMENTS; segment++) {
      for (const end of [segment, segment + 1]) {
        const point = points[end]
        positions.set([point.x, point.y, point.z], vertex * 3)
        tint.toArray(colors, vertex * 3)
        along[vertex] = end / ARC_SEGMENTS
        phases[vertex] = (index * 0.37) % 1
        vertex++
      }
    }
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.setAttribute('along', new BufferAttribute(along, 1))
  geometry.setAttribute('phase', new BufferAttribute(phases, 1))
  return geometry
}

interface CampusArcsProps {
  spokes: readonly CampusSpoke[]
  chipOf: (spoke: CampusSpoke) => string
  hub: CampusGeometry['hub']
  coreY: number
  // 0..1, written by the Brain on a memory pulse.
  flash: { value: number }
}

// One curved line per room up to the Brain's core, every arc in one draw.
export function CampusArcs({ spokes, chipOf, hub, coreY, flash }: CampusArcsProps) {
  const geometry = useMemo(
    () => arcGeometry(spokes, chipOf, { x: hub.x, y: coreY, z: hub.z }),
    [spokes, chipOf, hub.x, hub.z, coreY]
  )
  const material = useMemo(
    () => campusGlowMaterial(ARC_VERTEX, ARC_FRAGMENT, { uFlash: flash }),
    [flash]
  )
  useEffect(() => () => geometry?.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  if (!geometry) return null
  return <lineSegments geometry={geometry} material={material} name="campus-arcs" />
}
