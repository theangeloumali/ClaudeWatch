import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  EllipseCurve,
  Euler,
  LineBasicMaterial,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type InstancedMesh,
  type LineLoop,
  type Mesh
} from 'three'
import type { MemoryNotes } from '../../../../shared/office/types'
import type { CampusGeometry } from '../../logic/campus-geometry'
import { breath, breathScale, campusClock, rippleAt, shockwaveAt } from '../../logic/campus-motion'
import { sceneMotion } from '../../logic/scene-motion'
import { MOTE_VERTEX, seededPoints, SPARK_VERTEX } from './brain-glow'
import { campusGlowMaterial, SOFT_DOT_FRAGMENT } from './campus-shaders'

const GLOW = '#38e1ff'
const CORE = '#e6fbff'
const PLATFORM_HEIGHT_M = 0.5
const PEDESTAL_HEIGHT_M = 1.2
const SPHERE_RADIUS_M = 2.1
const BEAM_HEIGHT_M = 42
// The last ring traces the platform rim, so the plaza edge glows too.
const RING_SHARES = [0.5, 0.7, 0.88, 1] as const
const RING_WIDTH_M = 0.22
const RING_BASE_OPACITY = 0.85
const PULSE_MS = 1_200
// Tilts in radians for the orbit ellipses, so they cross rather than stack.
const ORBIT_TILTS = [0.35, -0.55, 1.1] as const
// Radians a second: each loop spins in its own plane, and its electron runs the loop faster.
const ORBIT_SPIN = [0.25, -0.18, 0.12] as const
const ELECTRON_SPEED = [1.4, -1.1, 0.9] as const
const ORBIT_SQUASH = 0.62
const BREATH_S = 4
const RIPPLE_S = 3.2
const RIPPLE_PHASES = [0, 0.5] as const
const SHOCKWAVE_SLOT = RIPPLE_PHASES.length
const MOTE_COUNT = 60
const SPARK_COUNT = 90
const Y_AXIS = new Vector3(0, 1, 0)

// The core's centre above the ground; the room arcs end here.
export const BRAIN_CORE_Y_M = PLATFORM_HEIGHT_M + PEDESTAL_HEIGHT_M + SPHERE_RADIUS_M

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

const orbitRadius = (index: number): number => SPHERE_RADIUS_M + 1.1 + index * 0.6

function orbitGeometry(radius: number): BufferGeometry {
  const curve = new EllipseCurve(0, 0, radius, radius * ORBIT_SQUASH, 0, Math.PI * 2)
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
  // Written here on a memory pulse, read by the room arcs.
  flash: { value: number }
}

// THE BRAIN: a raised disc, glowing rings, a breathing core on a pedestal, a beam and orbits.
export function CampusHub({ hub, memory, isReducedMotion, flash }: CampusHubProps) {
  const ringMaterials = useMemo(
    () => RING_SHARES.map(() => glowMaterial(GLOW, RING_BASE_OPACITY)),
    []
  )
  const beamMaterial = useMemo(() => glowMaterial(GLOW, 0.6), [])
  const beamHazeMaterial = useMemo(() => glowMaterial(GLOW, 0.14), [])
  const haloMaterial = useMemo(() => glowMaterial(GLOW, 0.32), [])
  const outerHaloMaterial = useMemo(() => glowMaterial(GLOW, 0.1), [])
  // White: each ripple instance carries its own glow colour, dimmed as it fades.
  const rippleMaterial = useMemo(() => glowMaterial('#ffffff', 1), [])
  const electronMaterial = useMemo(() => glowMaterial(CORE, 1), [])
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
  const orbits = useMemo(() => ORBIT_TILTS.map((_, index) => orbitGeometry(orbitRadius(index))), [])
  const rippleGeometry = useMemo(() => new RingGeometry(0.96, 1, 96).rotateX(-Math.PI / 2), [])
  const electronGeometry = useMemo(() => new SphereGeometry(0.26, 12, 8), [])
  const motes = useMemo(
    () => seededPoints(MOTE_COUNT, 0xb3a7, [new Color(CORE), new Color(GLOW)]),
    []
  )
  const sparks = useMemo(
    () => seededPoints(SPARK_COUNT, 0x5a4c, [new Color(GLOW), new Color('#7fd8ff')]),
    []
  )
  const moteMaterial = useMemo(
    () =>
      campusGlowMaterial(MOTE_VERTEX, SOFT_DOT_FRAGMENT, {
        uHeight: { value: BEAM_HEIGHT_M * 0.7 }
      }),
    []
  )
  const sparkMaterial = useMemo(
    () => campusGlowMaterial(SPARK_VERTEX, SOFT_DOT_FRAGMENT, { uRadius: { value: hub.radius } }),
    [hub.radius]
  )
  useEffect(
    () => () => {
      for (const material of [
        ...ringMaterials,
        beamMaterial,
        beamHazeMaterial,
        haloMaterial,
        outerHaloMaterial,
        rippleMaterial,
        electronMaterial,
        orbitMaterial,
        moteMaterial
      ])
        material.dispose()
      for (const geometry of [...orbits, rippleGeometry, electronGeometry, motes, sparks])
        geometry.dispose()
    },
    [
      ringMaterials,
      beamMaterial,
      beamHazeMaterial,
      haloMaterial,
      outerHaloMaterial,
      rippleMaterial,
      electronMaterial,
      orbitMaterial,
      moteMaterial,
      orbits,
      rippleGeometry,
      electronGeometry,
      motes,
      sparks
    ]
  )
  useEffect(() => () => sparkMaterial.dispose(), [sparkMaterial])

  const top = PLATFORM_HEIGHT_M
  const sphereY = BRAIN_CORE_Y_M
  const pulse = usePulse(memory?.changedAt, isReducedMotion)
  const ringsRef = useRef<(Mesh | null)[]>([])
  const coreRef = useRef<Mesh>(null)
  const loopsRef = useRef<(LineLoop | null)[]>([])
  const ripplesRef = useRef<InstancedMesh>(null)
  const electronsRef = useRef<InstancedMesh>(null)
  // Scratch and per-orbit frames, built once so the frame loop allocates nothing.
  const scratch = useMemo(
    () => ({
      object: new Object3D(),
      point: new Vector3(),
      tint: new Color(),
      glow: new Color(GLOW),
      frames: ORBIT_TILTS.map((tilt, index) =>
        new Matrix4().makeRotationFromEuler(new Euler(tilt, index * 1.2, 0))
      ),
      lastTime: Number.NaN
    }),
    []
  )

  useFrame((state) => {
    const time = campusClock.uTime.value
    const age = pulse.ageAt(state.clock.elapsedTime * 1000)
    // A frozen clock (reduced motion) with no pulse running leaves every value as it was.
    if (age === null && time === scratch.lastTime) return
    scratch.lastTime = time
    const { object, point, tint, glow, frames } = scratch
    const lungs = breath(time, BREATH_S)
    coreRef.current?.scale.setScalar(breathScale(time, BREATH_S))
    // The halo dims as the core swells, so the glow seems to breathe in.
    haloMaterial.opacity = 0.22 + 0.2 * (1 - lungs)
    outerHaloMaterial.opacity = 0.06 + 0.08 * (1 - lungs)
    beamMaterial.opacity = 0.5 + 0.12 * breath(time, 0.9) + 0.06 * breath(time, 0.31)
    beamHazeMaterial.opacity = 0.1 + 0.08 * breath(time + 0.45, 1.7)

    ORBIT_TILTS.forEach((_, index) => {
      const spin = time * ORBIT_SPIN[index]
      const loop = loopsRef.current[index]
      if (loop) loop.rotation.y = spin
      const angle = time * ELECTRON_SPEED[index]
      const radius = orbitRadius(index)
      point
        .set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius * ORBIT_SQUASH)
        .applyAxisAngle(Y_AXIS, spin)
        .applyMatrix4(frames[index])
      object.position.set(point.x, point.y + sphereY, point.z)
      object.scale.setScalar(1)
      object.updateMatrix()
      electronsRef.current?.setMatrixAt(index, object.matrix)
    })
    if (electronsRef.current) electronsRef.current.instanceMatrix.needsUpdate = true

    const ripples = ripplesRef.current
    if (ripples) {
      const placeRipple = (slot: number, share: number, opacity: number): void => {
        object.position.set(0, top + 0.03, 0)
        object.scale.setScalar(SPHERE_RADIUS_M + share * (hub.radius - SPHERE_RADIUS_M))
        object.updateMatrix()
        ripples.setMatrixAt(slot, object.matrix)
        ripples.setColorAt(slot, tint.copy(glow).multiplyScalar(opacity))
      }
      RIPPLE_PHASES.forEach((phase, slot) => {
        const ripple = rippleAt(time, RIPPLE_S, phase)
        placeRipple(slot, ripple.share, ripple.opacity * 0.8)
      })
      const wave = age === null || isReducedMotion ? null : shockwaveAt(age)
      placeRipple(SHOCKWAVE_SLOT, wave?.share ?? 0, wave ? wave.opacity * 1.6 : 0)
      ripples.instanceMatrix.needsUpdate = true
      if (ripples.instanceColor) ripples.instanceColor.needsUpdate = true
    }

    if (age === null) return
    const strength = pulseStrength(age, isReducedMotion)
    if (strength === 0) pulse.settle()
    sceneMotion.mark()
    flash.value = strength
    ringMaterials.forEach((material, index) => {
      material.opacity = RING_BASE_OPACITY + (1 - RING_BASE_OPACITY) * strength
      // A ring swells a little outward as it brightens; never under reduced motion.
      const ring = ringsRef.current[index]
      if (ring) ring.scale.setScalar(isReducedMotion ? 1 : 1 + 0.05 * strength)
    })
  })

  return (
    <group position={[hub.x, 0, hub.z]} name="campus-hub">
      <mesh position={[0, top / 2, 0]}>
        <cylinderGeometry args={[hub.radius, hub.radius * 1.04, top, 64]} />
        <meshStandardMaterial color="#18213a" roughness={0.7} metalness={0.3} />
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
          <ringGeometry args={[hub.radius * share - RING_WIDTH_M, hub.radius * share, 96]} />
        </mesh>
      ))}
      <instancedMesh
        ref={(mesh) => {
          ripplesRef.current = mesh
          // A black instance colour until the frame loop lights it, so instanceColor exists.
          if (mesh && !mesh.instanceColor) mesh.setColorAt(0, new Color('#000000'))
        }}
        args={[rippleGeometry, rippleMaterial, SHOCKWAVE_SLOT + 1]}
        frustumCulled={false}
        name="campus-ripples"
      />
      <mesh position={[0, top + PEDESTAL_HEIGHT_M / 2, 0]}>
        <cylinderGeometry args={[0.55, 0.9, PEDESTAL_HEIGHT_M, 24]} />
        <meshStandardMaterial color="#1d2540" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh ref={coreRef} position={[0, sphereY, 0]}>
        <sphereGeometry args={[SPHERE_RADIUS_M, 32, 20]} />
        <meshBasicMaterial color={CORE} toneMapped={false} />
      </mesh>
      <mesh position={[0, sphereY, 0]} material={haloMaterial}>
        <sphereGeometry args={[SPHERE_RADIUS_M * 1.3, 24, 16]} />
      </mesh>
      <mesh position={[0, sphereY, 0]} material={outerHaloMaterial}>
        <sphereGeometry args={[SPHERE_RADIUS_M * 1.85, 24, 16]} />
      </mesh>
      <mesh position={[0, sphereY + BEAM_HEIGHT_M / 2, 0]} material={beamMaterial}>
        <cylinderGeometry args={[0.3, 0.45, BEAM_HEIGHT_M, 12, 1, true]} />
      </mesh>
      <mesh position={[0, sphereY + BEAM_HEIGHT_M / 2, 0]} material={beamHazeMaterial}>
        <cylinderGeometry args={[0.9, 1.3, BEAM_HEIGHT_M, 16, 1, true]} />
      </mesh>
      <points
        geometry={motes}
        material={moteMaterial}
        position={[0, sphereY, 0]}
        frustumCulled={false}
      />
      <points
        geometry={sparks}
        material={sparkMaterial}
        position={[0, top, 0]}
        frustumCulled={false}
      />
      {orbits.map((orbit, index) => (
        <group
          key={ORBIT_TILTS[index]}
          position={[0, sphereY, 0]}
          rotation={[ORBIT_TILTS[index], index * 1.2, 0]}
        >
          <lineLoop
            ref={(loop) => {
              loopsRef.current[index] = loop
            }}
            geometry={orbit}
            material={orbitMaterial}
          />
        </group>
      ))}
      <instancedMesh
        ref={electronsRef}
        args={[electronGeometry, electronMaterial, ORBIT_TILTS.length]}
        frustumCulled={false}
        name="campus-electrons"
      />
    </group>
  )
}

interface Pulse {
  // Ms since the pulse began, or null when none is under way (nothing to write this frame).
  ageAt(clockMs: number): number | null
  settle(): void
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
      ageAt: (clockMs) => {
        if (isPendingRef.current) {
          isPendingRef.current = false
          startRef.current = clockMs
        }
        const start = startRef.current
        return start === null ? null : clockMs - start
      },
      // After the last write at 0, which settles the rings back to rest.
      settle: () => {
        startRef.current = null
      }
    }),
    []
  )
}
