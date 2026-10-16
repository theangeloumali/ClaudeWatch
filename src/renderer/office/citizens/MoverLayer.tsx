import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Object3D, type InstancedMesh } from 'three'
import type { ThemeZoneGroup } from '../logic/office-themes'
import { levelInUse } from '../logic/quality'
import { groundHeight } from '../player/walk-ground'
import type { Player } from '../player/walking'
import { useQualityChoice } from '../quality-store'
import type { FloorGeometry } from '../scene-model'
import { getTheme } from '../themes/registry'
import type { OfficeTheme } from '../themes/types'
import type { TownPlan } from '../town/town-plan'
import { themeIdsByZone, townTrips, type MoverKind } from '../town/town-trips'
import { citizenGeometry } from './figure-parts'
import { moverFigure, moverKinds } from './mover-kinds'
import { routePose, turnToward, walkedSec } from './route-pose'
import { SceneBodies } from '../scene/BodySpace'
import { advanceCitizen, citizenBodyId } from './crowd-movement'
import { moverClock, moverRouteKey, type MoverClock } from './mover-clock'
import { CITIZEN_POSITION_EPSILON } from './citizen-navigation'
import { CITIZEN_BODY_RADIUS } from '../../../shared/office/body-footprints'
import { citizenGround } from './city-sidewalks'

interface MoverLayerProps {
  floor: FloorGeometry
  plan: TownPlan
  // Lot id to the company that dresses it (`lotOwners`).
  owners: ReadonlyMap<string, string>
  floorTheme: OfficeTheme
  zoneGroups: readonly ThemeZoneGroup[]
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
// How far ahead of its middle a vehicle's nose is, and how near that may come to anyone on foot:
// under the 1.5 m between a lane's middle and the pavement beside it.
const NOSE_M: Record<Exclude<MoverKind, 'citizen'>, number> = {
  transit: 3,
  freight: 2,
  runabout: 1.4
}
const VEHICLE_HOLD_M = 1.4

const scratch = new Object3D()

// The town's citizens and vehicles: one instanced draw per kind of figure, moved by writing
// matrices. It asks for no frames of its own, so they move only on frames the scene draws anyway.
export function MoverLayer(props: MoverLayerProps) {
  const { floor, plan, owners, floorTheme, zoneGroups, player, isReducedMotion } = props
  const { hasVehicles } = props
  const bodies = useMemo(() => props.bodies ?? new SceneBodies(), [props.bodies])
  const ground = useMemo(() => citizenGround(floor, plan), [floor, plan])
  const { pin, chosen } = useQualityChoice()
  const detail = levelInUse(pin, chosen)
  // Keyed by what they say, not by identity: a floor change that moves no lot keeps every trip,
  // and with it how far each mover has got.
  const ownersKey = [...owners].join('|')
  const themesKey = zoneGroups
    .map(({ themeId, companies }) => `${themeId}=${companies.map((zone) => zone.id).join(',')}`)
    .join('|')
  const trips = useMemo(() => {
    return townTrips({
      plan,
      owners,
      floorThemeId: floorTheme.id,
      themeIdByZone: themeIdsByZone(zoneGroups),
      detail,
      hasVehicles
    })
  }, [plan, ownersKey, themesKey, floorTheme.id, detail, hasVehicles])
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
  const tripsKey = trips.map(moverRouteKey).join('|')
  // Presentation changes retain each unchanged route, even when the total mover count changes.
  const clock = useMemo(() => {
    const next = moverClock({
      trips,
      space: bodies,
      isOpen: ground.isOpen,
      previous: clockRef.current
    })
    clockRef.current = next
    return next
  }, [tripsKey, bodies])

  const place = (deltaSec: number): void => {
    const { moved, headings, onFoot } = clock
    const playerAt = player?.position ?? null
    // Citizens come first in the trips, so by the time a vehicle moves this holds them all.
    onFoot.length = 0
    kinds.forEach((kind, kindIndex) => {
      const mesh = meshesRef.current[kindIndex]
      const nose =
        kind.kind === 'citizen'
          ? null
          : { others: onFoot, reach: NOSE_M[kind.kind], radius: VEHICLE_HOLD_M }
      kind.members.forEach((index, instance) => {
        const { route, speed } = trips[index]
        if (deltaSec > 0 && !nose) {
          const next = advanceCitizen({
            trip: trips[index],
            index,
            pose: clock.positions[index],
            walked: moved[index],
            deltaSec,
            space: bodies,
            isOpen: ground.isOpen,
            ground
          })
          clock.positions[index] = next.pose
          moved[index] = next.walked
          clock.strides[index] += next.distance
          clock.isWalking[index] = next.distance > CITIZEN_POSITION_EPSILON
        } else if (deltaSec > 0)
          moved[index] = walkedSec({
            route,
            speed,
            walked: moved[index],
            deltaSec,
            player: playerAt,
            ...nose
          })
        const travelled = moved[index] * speed
        const pose = nose ? routePose(route, travelled, speed) : clock.positions[index]
        if (!nose && !pose.isIndoors) onFoot.push(pose)
        if (deltaSec > 0 && (nose || clock.isWalking[index]))
          headings[index] = turnToward(
            headings[index],
            pose.heading,
            nose ? deltaSec * TURN_PER_SEC : 1 - Math.exp(-deltaSec * TURN_PER_SEC)
          )
        const bob =
          nose || !clock.isWalking[index]
            ? 0
            : Math.abs(Math.sin((clock.strides[index] / STRIDE_M) * Math.PI)) * BOB_M
        scratch.position.set(pose.x, groundHeight(floor, pose) + bob, pose.z)
        scratch.rotation.y = headings[index]
        // Gone indoors: there, but nothing of it drawn.
        scratch.scale.setScalar(pose.isIndoors ? 0 : 1)
        scratch.updateMatrix()
        mesh?.setMatrixAt(instance, scratch.matrix)
      })
      if (mesh) mesh.instanceMatrix.needsUpdate = true
    })
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
    if (!isReducedMotion) place(Math.min(deltaSec, MAX_STEP_SEC))
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
    </>
  )
}
