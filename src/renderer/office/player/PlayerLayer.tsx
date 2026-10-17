import { CameraControlsImpl } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Vector3, type Group } from 'three'
import type { AgentView } from '../../../shared/office/types'
import { withLivePose } from '../../office-live/pose-store'
import { placeBody, PLAYER_BODY_RADIUS } from '../../../shared/office/body-footprints'
import type { SceneBodies } from '../scene/BodySpace'
import { ISO_POLAR, ISO_START_AZIMUTH } from '../logic/camera-bands'
import { hudSafeInsets, type InspectorLayout } from '../logic/hud-layout'
import type { FloorGeometry } from '../scene-model'
import { BEFORE_CONTROLS } from '../scene/use-camera-gestures'
import { isStillClick, trackPress } from '../scene/ZonePickers'
import type { Rect } from '../themes/lot-math'
import { GROUND_Y } from '../themes/surroundings'
import type { OfficeTheme, ThemePalette } from '../themes/types'
import { followBody } from './camera-follow'
import { playerGeometry } from './figure'
import { groundHeight, walkGround, walkPath } from './walk-ground'
import { sendPlayerToFloor } from './player-floor-routes'
import { listenForWalkKeys } from './walk-keys'
import { agentInReach, MAX_FRAME_SEC, sendPlayer, tickPlayer, type Player } from './walking'

interface PlayerLayerProps {
  player: Player
  isWalking: boolean
  floor: FloorGeometry
  allFloors: readonly FloorGeometry[]
  // Everything that stands on the ground: the town's lots and the plots of the belt.
  solids: readonly Rect[]
  // How far the player may be sent: the town's extent, or the floor's own without a town.
  extent: Rect
  agents: readonly AgentView[]
  palette: ThemePalette
  geometryFactory?: OfficeTheme['playerGeometry']
  isReducedMotion: boolean
  onSelectAgent: (agentKey: string) => void
  isCameraManuallyOwned?: boolean
  hasInspector?: boolean
  inspectorLayout?: InspectorLayout
  onNearAgent?: (agentKey: string | null) => void
  bodies?: SceneBodies
}

const FLAT = -Math.PI / 2
// Just under the zone plates, which catch a click on an office first.
const PLATE_PICK_Y = 0.01
const TURN_PER_SEC = 14
const STRIDE_M = 0.7
const BOB_M = 0.05
// The first frame of a walk reports the idle gap before it: it is walked as one display frame.
const FIRST_FRAME_SEC = 1 / 60
const CAMERA_INPUTS = ['pointerdown', 'wheel'] as const

function turnToward(from: number, to: number, share: number): number {
  const gap = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return from + gap * Math.min(1, share)
}

// The owner's character, the ground it can be sent across, and the camera that goes with it.
// It asks for a frame only while it moves; standing, it costs nothing but its one draw.
export function PlayerLayer(props: PlayerLayerProps) {
  const { player, isWalking, floor, solids, extent, agents, palette } = props
  const invalidate = useThree((state) => state.invalidate)
  const figureRef = useRef<Group>(null)
  const strideRef = useRef(0)
  const wasMovingRef = useRef(false)
  // The camera is still sweeping to the player; ended by the owner's hand on the camera.
  const isFollowingRef = useRef(false)
  const target = useMemo(() => new Vector3(), [])
  const ground = useMemo(() => walkGround(floor, solids, extent), [floor, solids, extent])
  const grounds = useMemo(
    () =>
      new Map(
        props.allFloors.map((surface) => [
          surface.floorId,
          walkGround(
            surface,
            (surface.elevation ?? 0) === 0 ? solids : [],
            (surface.elevation ?? 0) === 0 ? extent : surface
          )
        ])
      ),
    [props.allFloors, solids, extent]
  )
  const hasPlacedRef = useRef(false)
  const physicalGround = () => {
    const physical = grounds.get(player.physicalFloorId ?? '')
    if (physical) return physical
    const groundFloor = props.allFloors.find((surface) => (surface.elevation ?? 0) === 0)
    return (groundFloor && grounds.get(groundFloor.floorId)) || ground
  }
  const playerHeight = () =>
    player.elevation ?? groundHeight(latestRef.current.floor, player.position)
  const geometryFactory = props.geometryFactory ?? playerGeometry
  const geometry = useMemo(() => geometryFactory(palette), [palette, geometryFactory])
  useEffect(() => () => geometry.dispose(), [geometry])
  const [nearAgent, setNearAgent] = useState<AgentView | null>(null)
  const latest = { ...props, nearAgent }
  const latestRef = useRef(latest)
  latestRef.current = latest
  useEffect(() => {
    props.onNearAgent?.(nearAgent?.agentKey ?? null)
  }, [nearAgent?.agentKey, props.onNearAgent])

  const place = (heading: number, lift: number): void => {
    const figure = figureRef.current
    if (!figure) return
    const { x, z } = player.position
    figure.position.set(x, playerHeight() + lift, z)
    figure.rotation.y = heading
  }

  useLayoutEffect(() => {
    const position = hasPlacedRef.current
      ? null
      : placeBody({
          body: {
            id: 'owner-player',
            ...player.position,
            elevation: player.elevation,
            radius: PLAYER_BODY_RADIUS
          },
          obstacles: props.bodies?.all() ?? [],
          isOpen: physicalGround().isOpen
        })
    if (position) player.position = position
    hasPlacedRef.current = true
    props.bodies?.set({
      id: 'owner-player',
      ...player.position,
      elevation: player.elevation,
      connectorId: player.connectorId,
      radius: PLAYER_BODY_RADIUS
    })
    place(player.heading, 0)
    invalidate()
    // `floor` is here so it is placed again when the floor re-packs under it.
  }, [player, floor, invalidate, props.bodies, ground])
  useEffect(
    () => () => {
      props.bodies?.remove('owner-player')
      props.onNearAgent?.(null)
    },
    [props.bodies, props.onNearAgent]
  )

  useEffect(() => {
    player.onGoal = invalidate
    return () => {
      player.onGoal = null
    }
  }, [player, invalidate])

  useEffect(() => {
    if (!isWalking) {
      // A committed connector transfer lands safely even after control is released.
      if (!player.path.some((point) => point.connectorId)) player.path = []
      player.held.clear()
      player.goal = null
      isFollowingRef.current = false
      return
    }
    const stopFollowing = (): void => {
      isFollowingRef.current = false
    }
    // Taking the player, by the switch or by a key, brings the camera to it even before it moves.
    const follow = (): void => {
      isFollowingRef.current = true
      invalidate()
    }
    follow()
    for (const type of CAMERA_INPUTS) window.addEventListener(type, stopFollowing)
    const stopListening = listenForWalkKeys({
      player,
      onTalk: () => {
        const beside = latestRef.current.nearAgent
        if (beside) latestRef.current.onSelectAgent(beside.agentKey)
      },
      onChange: follow
    })
    return () => {
      for (const type of CAMERA_INPUTS) window.removeEventListener(type, stopFollowing)
      stopListening()
    }
  }, [isWalking, player, invalidate])

  // Agents walk too: one that comes up to a standing player is offered as well.
  useEffect(() => {
    setNearAgent(
      isWalking
        ? agentInReach(
            { ...player.position, elevation: player.elevation },
            agents.map(withLivePose)
          )
        : null
    )
  }, [isWalking, agents, player])

  useFrame((state, deltaSec) => {
    const { isReducedMotion } = latestRef.current
    if (latestRef.current.isCameraManuallyOwned) isFollowingRef.current = false
    if (!latestRef.current.isWalking && !player.path.some((point) => point.connectorId)) return
    const activeGround = physicalGround()
    if (player.goal) {
      player.path = walkPath(activeGround, player.position, player.goal).slice(1)
      player.goal = null
    }
    const controls = state.controls instanceof CameraControlsImpl ? state.controls : null
    const azimuth = controls?.azimuthAngle ?? ISO_START_AZIMUTH
    const polar = controls?.polarAngle ?? ISO_POLAR
    const before = player.position
    const frameSec = Math.min(deltaSec, wasMovingRef.current ? MAX_FRAME_SEC : FIRST_FRAME_SEC)
    const hasMoved = tickPlayer(player, activeGround, frameSec, azimuth, props.bodies?.all() ?? [])
    props.bodies?.set({
      id: 'owner-player',
      ...player.position,
      elevation: player.elevation,
      connectorId: player.connectorId,
      radius: PLAYER_BODY_RADIUS
    })
    const figure = figureRef.current
    if (hasMoved) {
      if (!latestRef.current.isCameraManuallyOwned) isFollowingRef.current = true
      strideRef.current += Math.hypot(player.position.x - before.x, player.position.z - before.z)
      if (isReducedMotion || !figure) place(player.heading, 0)
      else
        place(
          turnToward(figure.rotation.y, player.heading, frameSec * TURN_PER_SEC),
          Math.abs(Math.sin((strideRef.current / STRIDE_M) * Math.PI)) * BOB_M
        )
      const beside = agentInReach(
        { ...player.position, elevation: player.elevation },
        latestRef.current.agents.map(withLivePose)
      )
      if (beside?.agentKey !== latestRef.current.nearAgent?.agentKey) setNearAgent(beside)
    } else if (strideRef.current !== 0) {
      // The frame after the last step: drop the bob and finish the turn.
      place(player.heading, 0)
      strideRef.current = 0
    }

    if (isFollowingRef.current && controls) {
      controls.getTarget(target, false)
      const ride = followBody({
        body: { x: player.position.x, y: playerHeight(), z: player.position.z },
        view: { target: [target.x, target.y, target.z], zoom: state.camera.zoom, azimuth, polar },
        viewport: state.size,
        deltaSec: frameSec,
        isReducedMotion,
        isCameraManuallyOwned: latestRef.current.isCameraManuallyOwned,
        insets: hudSafeInsets(
          latestRef.current.hasInspector ?? false,
          latestRef.current.inspectorLayout
        )
      })
      if (ride.target) void controls.moveTo(...ride.target, false)
      // Standing still, the sweep ends once the player is back in view.
      if (ride.isSettled && !hasMoved) isFollowingRef.current = false
    }
    // Only movement asks for the next frame: a standing player with a settled camera asks for none.
    wasMovingRef.current = hasMoved || isFollowingRef.current
    if (wasMovingRef.current) invalidate()
  }, BEFORE_CONTROLS)

  const walkHere = (event: ThreeEvent<MouseEvent>): void => {
    if (!isStillClick(event)) return
    event.stopPropagation()
    if (
      player.physicalFloorId !== floor.floorId &&
      Math.abs(event.point.y - (floor.elevation ?? 0)) < 0.1
    ) {
      sendPlayerToFloor(player, {
        fromFloor: props.allFloors.find((surface) => surface.floorId === player.physicalFloorId),
        toFloor: floor,
        destination: event.point,
        allFloors: props.allFloors
      })
    } else if (!player.path.some((point) => point.connectorId)) sendPlayer(player, event.point)
  }
  const plate = { x: floor.x, z: floor.z }
  return (
    <>
      <group ref={figureRef}>
        <mesh geometry={geometry} frustumCulled={false}>
          <meshStandardMaterial vertexColors roughness={0.8} metalness={0.15} />
        </mesh>
      </group>
      {isWalking && (
        <>
          <mesh
            position={[extent.x, GROUND_Y, extent.z]}
            rotation={[FLAT, 0, 0]}
            onPointerDown={trackPress}
            onClick={walkHere}
          >
            <planeGeometry args={[extent.width, extent.depth]} />
            <meshBasicMaterial visible={false} />
          </mesh>
          <mesh
            position={[plate.x, (floor.elevation ?? 0) + PLATE_PICK_Y, plate.z]}
            rotation={[FLAT, 0, 0]}
            onPointerDown={trackPress}
            onClick={walkHere}
          >
            <planeGeometry args={[floor.width, floor.depth]} />
            <meshBasicMaterial visible={false} />
          </mesh>
        </>
      )}
    </>
  )
}
