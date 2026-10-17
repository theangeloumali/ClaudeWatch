import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Object3D, RingGeometry, type InstancedMesh } from 'three'
import { cityEvents } from '../../office-live/city-events'
import { workTripStore } from '../../office-live/work-trip-store'
import { groundHeight } from '../player/walk-ground'
import type { Player } from '../player/walking'
import { useQualityLevel } from '../quality-store'
import type { FloorGeometry } from '../scene-model'
import { getTheme } from '../themes/registry'
import type { OfficeTheme } from '../themes/types'
import type { TownPlan } from '../town/town-plan'
import { townTrips } from '../town/town-trips'
import { citizenGeometry } from './figure-parts'
import { moverFigure, moverKinds } from './mover-kinds'
import { routePose, turnToward, type CitizenPose } from './route-pose'
import { SceneBodies } from '../scene/BodySpace'
import { citizenBodyId } from './crowd-movement'
import { moverClock, moverRouteKey, type MoverClock } from './mover-clock'
import { CITIZEN_BODY_RADIUS } from '../../../shared/office/body-footprints'
import { citizenGround } from './city-sidewalks'
import { stepMovers } from './mover-step'
import { createWorkFleet, type WorkCarry, type WorkFleet } from './work-fleet'

interface MoverLayerProps {
  floor: FloorGeometry
  plan: TownPlan
  floorTheme: OfficeTheme
  player: Player | null | undefined
  isReducedMotion: boolean
  // The settings panel's switch.
  hasVehicles: boolean
  bodies?: SceneBodies
}

// A window coming back from hidden reports the whole gap as one frame: it is moved as this much.
const MAX_STEP_SEC = 0.25
const TURN_PER_SEC = 7
const STRIDE_M = 0.3
const BOB_M = 0.02
// A work trip's ground ring, just clear of the road paint.
const RING_LIFT_M = 0.04
const scratch = new Object3D()

// The town's citizens and vehicles: one instanced draw per kind of figure, moved by writing
// matrices. It asks for no frames of its own, so they move only on frames the scene draws anyway.
export function MoverLayer(props: MoverLayerProps) {
  const { floor, plan, floorTheme, player, isReducedMotion } = props
  const { hasVehicles } = props
  const bodies = useMemo(() => props.bodies ?? new SceneBodies(), [props.bodies])
  const ground = useMemo(() => citizenGround(plan), [plan])
  const detail = useQualityLevel()
  const trips = useMemo(() => {
    return townTrips({ plan, floorThemeId: floorTheme.id, detail, hasVehicles })
  }, [plan, floorTheme.id, detail, hasVehicles])
  const kinds = useMemo(() => moverKinds(trips), [trips])
  // Keyed by what is drawn, so trips that change with the same kinds upload nothing new.
  const kindsKey = kinds.map((kind) => kind.key).join('|')
  const geometries = useMemo(
    () => kinds.map((kind) => citizenGeometry(moverFigure(kind, getTheme(kind.themeId)))),
    [kindsKey]
  )
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries])

  const meshesRef = useRef<(InstancedMesh | null)[]>([])
  const clockRef = useRef<MoverClock | undefined>(undefined)
  const fleetRef = useRef<WorkFleet | undefined>(undefined)
  const carriedRef = useRef<WorkCarry[]>([])
  const tripsKey = trips.map(moverRouteKey).join('|')
  // Presentation changes retain each unchanged route, even when the total mover count changes.
  const clock = useMemo(() => {
    // Trips under way hand their loops back first, so the new clock keeps each slot's place.
    carriedRef.current.push(...(fleetRef.current?.release() ?? []))
    const next = moverClock({
      trips,
      space: bodies,
      isOpen: ground.isOpen,
      previous: clockRef.current
    })
    clockRef.current = next
    return next
  }, [tripsKey, bodies])

  // Work trips borrow fleet slots and re-route from where they stand after a relayout.
  const fleet = useMemo(() => {
    carriedRef.current.push(...(fleetRef.current?.release() ?? []))
    const next = createWorkFleet({ plan, trips, clock, carried: carriedRef.current.splice(0) })
    fleetRef.current = next
    return next
  }, [plan, trips, clock])
  const vehicleSlots = useMemo(
    () => trips.flatMap((trip, index) => (trip.kind === 'citizen' ? [] : [index])),
    [trips]
  )
  const hasRings = detail === 'full' && vehicleSlots.length > 0
  const ringGeometry = useMemo(() => new RingGeometry(1.2, 1.6, 20).rotateX(-Math.PI / 2), [])
  useEffect(() => () => ringGeometry.dispose(), [ringGeometry])
  const ringsRef = useRef<InstancedMesh | null>(null)
  // The ring instances lit last frame; null until a new mesh's first write.
  const ringsShown = useRef<readonly number[] | null>(null)

  const place = (deltaSec: number): void => {
    const { moved, headings } = clock
    const { trips: movers, traffic } = fleet
    if (deltaSec > 0)
      stepMovers({
        trips: movers,
        clock,
        space: bodies,
        ground,
        player: player?.position ?? null,
        // One-way sidewalks leave a jammed walker no room to step aside (citizens-2).
        waitsFor: clock.waitsFor,
        traffic,
        deltaSec
      })
    fleet.settle()
    const posed: CitizenPose[] = []
    kinds.forEach((kind, kindIndex) => {
      const mesh = meshesRef.current[kindIndex]
      const isVehicle = kind.kind !== 'citizen'
      kind.members.forEach((index, instance) => {
        const { route, speed } = movers[index]
        const pose = isVehicle
          ? routePose(route, moved[index] * speed, speed)
          : clock.positions[index]
        if (deltaSec > 0 && (isVehicle || clock.isWalking[index]))
          headings[index] = turnToward(
            headings[index],
            pose.heading,
            isVehicle ? deltaSec * TURN_PER_SEC : 1 - Math.exp(-deltaSec * TURN_PER_SEC)
          )
        const bob =
          isVehicle || !clock.isWalking[index]
            ? 0
            : Math.abs(Math.sin((clock.strides[index] / STRIDE_M) * Math.PI)) * BOB_M
        posed[index] = pose
        scratch.position.set(pose.x, groundHeight(floor, pose) + bob, pose.z)
        scratch.rotation.y = headings[index]
        // Gone indoors: there, but nothing of it drawn.
        scratch.scale.setScalar(pose.isIndoors ? 0 : 1)
        scratch.updateMatrix()
        mesh?.setMatrixAt(instance, scratch.matrix)
      })
      if (mesh) mesh.instanceMatrix.needsUpdate = true
    })
    const rings = ringsRef.current
    const working = fleet.inFlight()
    const shown = ringsShown.current
    if (!rings || (working.length === 0 && shown?.length === 0)) return
    const lit = working.map((slot) => vehicleSlots.indexOf(slot))
    // Only the rings lit now or last frame change; a new mesh has every one to clear.
    const changed = shown === null ? vehicleSlots.keys() : new Set([...shown, ...lit])
    rings.instanceMatrix.clearUpdateRanges()
    for (const instance of changed) {
      const pose = posed[vehicleSlots[instance]]
      scratch.position.set(pose.x, groundHeight(floor, pose) + RING_LIFT_M, pose.z)
      scratch.rotation.y = 0
      scratch.scale.setScalar(lit.includes(instance) && !pose.isIndoors ? 1 : 0)
      scratch.updateMatrix()
      rings.setMatrixAt(instance, scratch.matrix)
      if (shown !== null) rings.instanceMatrix.addUpdateRange(instance * 16, 16)
    }
    rings.instanceMatrix.needsUpdate = true
    ringsShown.current = lit
  }

  // Placed on every commit: under reduced motion this is where they stay, where their loops start.
  useLayoutEffect(() => {
    clock.positions.forEach((pose, index) => {
      if (trips[index].kind === 'citizen' && !pose.isIndoors)
        bodies.set({ id: citizenBodyId(index), x: pose.x, z: pose.z, radius: CITIZEN_BODY_RADIUS })
    })
    place(0)
    return () =>
      trips.forEach((trip, index) => {
        if (trip.kind === 'citizen') bodies.remove(citizenBodyId(index))
      })
  }, [clock, bodies, trips, ground])
  useFrame((_state, deltaSec) => {
    if (isReducedMotion) return
    for (const request of workTripStore.take(cityEvents.active())) fleet.dispatch(request)
    place(Math.min(deltaSec, MAX_STEP_SEC))
  })

  return (
    <>
      {kinds.map((kind, kindIndex) => (
        <instancedMesh
          key={`${kind.key}:${kind.members.length}`}
          ref={(mesh) => {
            meshesRef.current[kindIndex] = mesh
          }}
          args={[geometries[kindIndex], undefined, kind.members.length]}
          frustumCulled={false}
        >
          <meshStandardMaterial vertexColors roughness={0.85} metalness={0.05} />
        </instancedMesh>
      ))}
      {hasRings && (
        <instancedMesh
          name="work-trip-rings"
          ref={(mesh) => {
            ringsRef.current = mesh
            ringsShown.current = null
          }}
          args={[ringGeometry, undefined, vehicleSlots.length]}
          frustumCulled={false}
        >
          <meshStandardMaterial color={floorTheme.palette.glow} roughness={0.6} metalness={0} />
        </instancedMesh>
      )}
    </>
  )
}
