import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferGeometry,
  EllipseCurve,
  LineBasicMaterial,
  MeshBasicMaterial,
  Vector3,
  type Mesh
} from 'three'
import type { MemoryNotes } from '../../../../shared/office/types'
import type { CampusGeometry } from '../../logic/campus-geometry'
import { sceneMotion } from '../../logic/scene-motion'

const GLOW = '#38e1ff'
const CORE = '#e6fbff'
const PLATFORM_HEIGHT_M = 0.5
const PEDESTAL_HEIGHT_M = 1.2
const SPHERE_RADIUS_M = 1.5
const BEAM_HEIGHT_M = 42
const RING_SHARES = [0.52, 0.72, 0.92] as const
const RING_BASE_OPACITY = 0.55
const PULSE_MS = 1_200
// Tilts in radians for the orbit ellipses, so they cross rather than stack.
const ORBIT_TILTS = [0.35, -0.55, 1.1] as const

// Additive and unlit: the glow needs no post-processing on a night ground.
const glowMaterial = (color: string, opacity: number): MeshBasicMaterial =>
  new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  })

function orbitGeometry(radius: number): BufferGeometry {
  const curve = new EllipseCurve(0, 0, radius, radius * 0.62, 0, Math.PI * 2)
  return new BufferGeometry().setFromPoints(
    curve.getPoints(64).map((point) => new Vector3(point.x, 0, point.y))
  )
}

// 0..1 for how lit a pulse is `elapsedMs` in; reduced motion holds a flat step instead.
function pulseStrength(elapsedMs: number, isReducedMotion: boolean): number {
  if (elapsedMs < 0 || elapsedMs >= PULSE_MS) return 0
  if (isReducedMotion) return 1
  const remaining = 1 - elapsedMs / PULSE_MS
  return remaining * remaining
}

interface CampusHubProps {
  hub: CampusGeometry['hub']
  memory?: MemoryNotes
  isReducedMotion: boolean
}

// THE BRAIN: a raised disc, glowing rings, a pale core on a pedestal, a beam and orbit lines.
export function CampusHub({ hub, memory, isReducedMotion }: CampusHubProps) {
  const ringMaterials = useMemo(
    () => RING_SHARES.map(() => glowMaterial(GLOW, RING_BASE_OPACITY)),
    []
  )
  const beamMaterial = useMemo(() => glowMaterial(GLOW, 0.28), [])
  const haloMaterial = useMemo(() => glowMaterial(GLOW, 0.18), [])
  const orbitMaterial = useMemo(
    () =>
      new LineBasicMaterial({
        color: GLOW,
        transparent: true,
        opacity: 0.6,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      }),
    []
  )
  const orbits = useMemo(() => ORBIT_TILTS.map((_, index) => orbitGeometry(2.6 + index * 0.5)), [])
  useEffect(
    () => () => {
      for (const material of [...ringMaterials, beamMaterial, haloMaterial, orbitMaterial])
        material.dispose()
      for (const orbit of orbits) orbit.dispose()
    },
    [ringMaterials, beamMaterial, haloMaterial, orbitMaterial, orbits]
  )

  const pulse = usePulse(memory?.changedAt, isReducedMotion)
  const ringsRef = useRef<(Mesh | null)[]>([])
  useFrame((state) => {
    const strength = pulse.strengthAt(state.clock.elapsedTime * 1000)
    if (strength === null) return
    sceneMotion.mark()
    ringMaterials.forEach((material, index) => {
      material.opacity = RING_BASE_OPACITY + (1 - RING_BASE_OPACITY) * strength
      // A ring swells a little outward as it brightens; never under reduced motion.
      const ring = ringsRef.current[index]
      if (ring) ring.scale.setScalar(isReducedMotion ? 1 : 1 + 0.05 * strength)
    })
  })

  const top = PLATFORM_HEIGHT_M
  const sphereY = top + PEDESTAL_HEIGHT_M + SPHERE_RADIUS_M
  return (
    <group position={[hub.x, 0, hub.z]} name="campus-hub">
      <mesh position={[0, top / 2, 0]}>
        <cylinderGeometry args={[hub.radius, hub.radius * 1.04, top, 64]} />
        <meshStandardMaterial color="#141a2e" roughness={0.7} metalness={0.3} />
      </mesh>
      {RING_SHARES.map((share, index) => (
        <mesh
          key={share}
          ref={(mesh) => {
            ringsRef.current[index] = mesh
          }}
          position={[0, top + 0.01 + index * 0.002, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={ringMaterials[index]}
        >
          <ringGeometry args={[hub.radius * share - 0.12, hub.radius * share, 96]} />
        </mesh>
      ))}
      <mesh position={[0, top + PEDESTAL_HEIGHT_M / 2, 0]}>
        <cylinderGeometry args={[0.55, 0.9, PEDESTAL_HEIGHT_M, 24]} />
        <meshStandardMaterial color="#1d2540" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh position={[0, sphereY, 0]}>
        <sphereGeometry args={[SPHERE_RADIUS_M, 32, 20]} />
        <meshBasicMaterial color={CORE} toneMapped={false} />
      </mesh>
      <mesh position={[0, sphereY, 0]} material={haloMaterial}>
        <sphereGeometry args={[SPHERE_RADIUS_M * 1.35, 24, 16]} />
      </mesh>
      <mesh position={[0, sphereY + BEAM_HEIGHT_M / 2, 0]} material={beamMaterial}>
        <cylinderGeometry args={[0.12, 0.2, BEAM_HEIGHT_M, 12, 1, true]} />
      </mesh>
      {orbits.map((orbit, index) => (
        <lineLoop
          key={ORBIT_TILTS[index]}
          geometry={orbit}
          material={orbitMaterial}
          position={[0, sphereY, 0]}
          rotation={[ORBIT_TILTS[index], index * 1.2, 0]}
        />
      ))}
    </group>
  )
}

interface Pulse {
  // Null when no pulse is under way (nothing to write this frame).
  strengthAt(clockMs: number): number | null
}

// A pulse starts on the first frame after `changedAt` grows; the first value seen is a baseline.
function usePulse(changedAt: number | undefined, isReducedMotion: boolean): Pulse {
  const seenRef = useRef(changedAt)
  const isPendingRef = useRef(false)
  const startRef = useRef<number | null>(null)
  useEffect(() => {
    const seen = seenRef.current
    if (changedAt !== undefined && seen !== undefined && changedAt > seen)
      isPendingRef.current = true
    if (changedAt !== undefined) seenRef.current = Math.max(changedAt, seen ?? changedAt)
  }, [changedAt])
  const reducedRef = useRef(isReducedMotion)
  reducedRef.current = isReducedMotion
  return useMemo(
    () => ({
      strengthAt: (clockMs) => {
        if (isPendingRef.current) {
          isPendingRef.current = false
          startRef.current = clockMs
        }
        const start = startRef.current
        if (start === null) return null
        const strength = pulseStrength(clockMs - start, reducedRef.current)
        // One last write at 0 settles the rings back to rest.
        if (strength === 0) startRef.current = null
        return strength
      }
    }),
    []
  )
}
