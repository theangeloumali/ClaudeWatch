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
import { themeIdsByZone, townTrips } from '../town/town-trips'
import { citizenGeometry } from './figure-parts'
import { moverFigure, moverKinds } from './mover-kinds'
import { routePose, turnToward } from './route-pose'
import { SceneBodies } from '../scene/BodySpace'
import { citizenBodyId } from './crowd-movement'
import { moverClock, moverRouteKey, type MoverClock } from './mover-clock'
import { CITIZEN_BODY_RADIUS } from '../../../shared/office/body-footprints'
import { citizenGround, citySidewalks } from './city-sidewalks'
import { stepMovers } from './mover-step'
import { zebraTraffic } from './zebra-traffic'

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
const scratch = new Object3D()

// The town's citizens and vehicles: one instanced draw per kind of figure, moved by writing
// matrices. It asks for no frames of its own, so they move only on frames the scene draws anyway.
export function MoverLayer(props: MoverLayerProps) {
  const { floor, plan, owners, floorTheme, zoneGroups, player, isReducedMotion } = props
  const { hasVehicles } = props
  const bodies = useMemo(() => props.bodies ?? new SceneBodies(), [props.bodies])
  const ground = useMemo(() => citizenGround(plan), [plan])
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

  const traffic = useMemo(() => zebraTraffic(trips, citySidewalks(plan)), [trips, plan])

  const place = (deltaSec: number): void => {
    const { moved, headings } = clock
    if (deltaSec > 0)
      stepMovers({
        trips,
        clock,
        space: bodies,
        ground,
        player: player?.position ?? null,
        // One-way sidewalks leave a jammed walker no room to step aside (citizens-2).
        waitsFor: clock.waitsFor,
        traffic,
        deltaSec
      })
    kinds.forEach((kind, kindIndex) => {
      const mesh = meshesRef.current[kindIndex]
      const isVehicle = kind.kind !== 'citizen'
      kind.members.forEach((index, instance) => {
        const { route, speed } = trips[index]
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
