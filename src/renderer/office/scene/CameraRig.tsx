import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3 } from 'three'
import type { AgentView } from '../../../shared/office/types'
import { livePose, officePoses, withLivePose } from '../../office-live/pose-store'
import { followBody } from '../player/camera-follow'
import {
  BAND_ZOOM,
  bandForZoom,
  buildingFraming,
  followAnchor,
  followStep,
  ISO_POLAR,
  ISO_START_AZIMUTH,
  loungesByRoom,
  MAX_POLAR,
  MAX_INSPECTION_ZOOM,
  MIN_POLAR,
  nearestAzimuth,
  type FollowAnchor,
  type ZoomBand
} from '../logic/camera-bands'
import type { CameraRequest } from '../logic/office-reducer'
import { officeView, type OfficeView } from '../logic/office-view'
import { boundsOfZone, frameBounds, occupiedBounds, type Bounds } from '../logic/zone-framing'
import { workstationFraming, workstationSeat } from '../logic/workstation-framing'
import { hudSafeInsets, type InspectorLayout } from '../logic/hud-layout'
import type { FloorGeometry } from '../scene-model'
import type { WorkstationSpec } from '../themes/types'
import { nearCityBounds } from '../logic/city-framing'
import { useCameraGestures, type CameraGestures } from './use-camera-gestures'
import { useCameraPresets } from './use-camera-presets'
import {
  agentElevation,
  floorElevation,
  floorEnvelope,
  floorForAgent,
  groundEnvelope
} from './all-floor-model'

const LOOK_HEIGHT = 0.6
// A lone office is framed no closer than this.
const FLOOR_MAX_ZOOM = 60
const CITY_MIN_ZOOM = 0.1
const CITY_ZOOM_MARGIN = 0.5
const DEFAULT_SCENE_HEIGHT = 8
// With truckSpeed 1 a drag moves the floor exactly as far as the hand; this short ease only
// hides the steps between pointer events, and reduced motion drops it.
const DRAG_SMOOTH_SEC = 0.05
const { ACTION } = CameraControlsImpl

interface CameraRigProps {
  floorCount: number
  // The extent of everything drawn; the widest zoom frames all of it.
  scene: { x?: number; z?: number; width: number; depth: number; maxY?: number }
  floor: FloorGeometry
  visibleFloors: readonly FloorGeometry[]
  viewMode?: 'city' | 'office'
  focusedFloorId?: string | null
  agents: readonly AgentView[]
  liveSessionKeys: ReadonlySet<string>
  request: CameraRequest | null
  onFit?: () => void
  onManualMove?: () => void
  workstation?: WorkstationSpec
  isReducedMotion: boolean
  // The owner is walking their player: the arrow keys are its, and the camera goes with it.
  isWalking?: boolean
  hasInspector?: boolean
  inspectorLayout?: InspectorLayout
  onBandChange: (band: ZoomBand) => void
  // The agent Follow rides along with; the reducer clears it on any other camera input.
  followedAgentKey?: string | null
}

// Bounded orthographic orbit. Presets re-arm framing; manual input owns the pose until then.
export function CameraRig(props: CameraRigProps) {
  const controlsRef = useRef<CameraControlsImpl>(null)
  const gesturesRef = useRef<CameraGestures | null>(null)
  const bandRef = useRef<ZoomBand>('floor')
  const bandZoomRef = useRef(Number.NaN)
  const bandPoseRef = useRef('')
  const followRef = useRef<FollowAnchor | null>(null)
  const followElevationRef = useRef(0)
  // Set by a Follow request, cleared by the owner's own input before the reducer hears of it.
  const isRidingRef = useRef(false)
  const workstationAgentRef = useRef<string | null>(null)
  const workstationSpecRef = useRef<WorkstationSpec | null>(null)
  const isTransitioningRef = useRef(false)
  // The camera frames the occupied floor by itself only until the owner moves it; Fit re-arms.
  const isAutoFramingRef = useRef(true)
  const isCityFramingRef = useRef(props.viewMode === 'city')
  // Whether the owner has moved the camera by hand since the last fly-to an agent.
  const hasMovedSinceFlyRef = useRef(false)
  const targetScratch = useMemo(() => new Vector3(), [])
  const viewScratch = useMemo(() => new Vector3(), [])
  const viewRef = useRef<OfficeView>({
    x: 0,
    y: 0,
    z: 0,
    zoom: 1,
    azimuth: 0,
    polar: 0,
    width: 0,
    height: 0
  })
  const size = useThree((state) => state.size)
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const cityEnvelope = useMemo(() => floorEnvelope(props.visibleFloors), [props.visibleFloors])
  const focusedFloor =
    props.visibleFloors.find((floor) => floor.floorId === props.focusedFloorId) ?? props.floor
  const envelope = useMemo(
    () => (props.viewMode === 'office' ? floorEnvelope([focusedFloor]) : cityEnvelope),
    [props.viewMode, focusedFloor, cityEnvelope]
  )
  const cameraFloor = useMemo(() => {
    if (props.viewMode === 'office') return focusedFloor
    return groundEnvelope(props.visibleFloors, props.floor)
  }, [props.viewMode, focusedFloor, props.visibleFloors, props.floor])
  const occupied = useMemo(
    () => occupiedBounds(cameraFloor, props.liveSessionKeys),
    [cameraFloor, props.liveSessionKeys]
  )
  const cityInsets = useMemo(
    () => hudSafeInsets(props.hasInspector !== false, props.inspectorLayout),
    [props.hasInspector, props.inspectorLayout]
  )
  const latest = { ...props, size, occupied, cityInsets, envelope, cityEnvelope, cameraFloor }
  const latestRef = useRef(latest)
  latestRef.current = latest

  // Stable helpers that read the latest props through the ref.
  const rig = useRef({
    takeOver(): void {
      isAutoFramingRef.current = false
      isCityFramingRef.current = false
    },
    startTransition(): void {
      isTransitioningRef.current = true
    },
    manualMove(): void {
      gesturesRef.current?.cancel()
      rig.stopTransition()
      rig.takeOver()
      hasMovedSinceFlyRef.current = true
      followRef.current = null
      isRidingRef.current = false
      workstationAgentRef.current = null
      workstationSpecRef.current = null
      latestRef.current.onManualMove?.()
    },
    stopTransition(): void {
      const controls = controlsRef.current
      if (!controls) return
      const isInFlight = controls.active || isTransitioningRef.current
      const azimuth = controls.azimuthAngle
      const polar = controls.polarAngle
      const zoom = camera.zoom
      controls.getTarget(targetScratch, false)
      controls.stop()
      // stop() lands on the transition's end in this library version; restore the live pose.
      if (isInFlight) {
        void controls.moveTo(targetScratch.x, targetScratch.y, targetScratch.z, false)
        void controls.rotateTo(azimuth, polar, false)
        void controls.zoomTo(zoom, false)
      }
      isTransitioningRef.current = false
    },
    preparePreset(): void {
      gesturesRef.current?.cancel()
      rig.stopTransition()
      rig.takeOver()
      followRef.current = null
      isRidingRef.current = false
      workstationAgentRef.current = null
      workstationSpecRef.current = null
      hasMovedSinceFlyRef.current = false
    },
    frame(
      bounds: Bounds,
      options: Omit<Parameters<typeof frameBounds>[2], 'azimuth'> & {
        azimuth?: number
        elevation?: number
      }
    ): void {
      const controls = controlsRef.current
      if (!controls) return
      gesturesRef.current?.cancel()
      const { size: viewport, isReducedMotion } = latestRef.current
      const { elevation = 0, ...framing } = options
      const view = frameBounds(bounds, viewport, {
        azimuth: controls.azimuthAngle,
        polar: controls.polarAngle,
        ...framing
      })
      isTransitioningRef.current = !isReducedMotion
      void controls.moveTo(
        view.target[0],
        view.target[1] + elevation,
        view.target[2],
        !isReducedMotion
      )
      void controls.zoomTo(view.zoom, !isReducedMotion)
    },
    frameFloor(pose?: { azimuth: number; polar: number }): void {
      if (pose) isAutoFramingRef.current = true
      rig.frame(latestRef.current.occupied, {
        ...pose,
        maxZoom: FLOOR_MAX_ZOOM,
        minZoom: CITY_MIN_ZOOM,
        height: latestRef.current.envelope
          ? latestRef.current.envelope.maxY - latestRef.current.envelope.minY
          : undefined,
        elevation: latestRef.current.envelope?.minY ?? floorElevation(latestRef.current.floor),
        insets: latestRef.current.cityInsets
      })
    },
    frameAgent(agent: AgentView): void {
      rig.frame(
        { minX: agent.x, maxX: agent.x, minZ: agent.z, maxZ: agent.z },
        {
          minZoom: BAND_ZOOM.desk,
          maxZoom: BAND_ZOOM.desk,
          height: LOOK_HEIGHT * 2,
          elevation: agentElevation(agent),
          insets: latestRef.current.cityInsets
        }
      )
      const floor = floorForAgent({
        agent,
        floors: latestRef.current.visibleFloors,
        fallback: latestRef.current.floor,
        purpose: 'presence'
      })
      // Reframing already includes the new room position; do not apply its follow delta again.
      followRef.current = followAnchor(agent, floor.rooms, loungesByRoom(floor.zones))
      followElevationRef.current = agentElevation(agent)
    },
    // The close-up is a zoom, never a dolly (N7): in to the floor band, or the owner's closer zoom.
    followAgent(agent: AgentView): void {
      rig.preparePreset()
      const zoom = Math.max(camera.zoom, BAND_ZOOM.floor)
      rig.frame(
        { minX: agent.x, maxX: agent.x, minZ: agent.z, maxZ: agent.z },
        {
          minZoom: zoom,
          maxZoom: zoom,
          height: LOOK_HEIGHT * 2,
          elevation: agentElevation(agent),
          insets: latestRef.current.cityInsets
        }
      )
      isRidingRef.current = true
    },
    frameWorkstation(agent: AgentView, focusedSpec?: WorkstationSpec): void {
      const controls = controlsRef.current
      const { size: viewport, cityInsets: insets, isReducedMotion } = latestRef.current
      const floor = floorForAgent({
        agent,
        floors: latestRef.current.visibleFloors,
        fallback: latestRef.current.floor,
        purpose: 'home'
      })
      const workstation = focusedSpec ?? latestRef.current.workstation
      const seat = workstationSeat(agent, floor)
      if (!controls || !seat || !workstation) return
      rig.preparePreset()
      const view = workstationFraming(seat, { spec: workstation, viewport, insets })
      isTransitioningRef.current = !isReducedMotion
      void controls.rotateTo(
        nearestAzimuth(controls.azimuthAngle, view.azimuth),
        view.polar,
        !isReducedMotion
      )
      void controls.moveTo(
        view.target[0],
        view.target[1] + floorElevation(floor),
        view.target[2],
        !isReducedMotion
      )
      void controls.zoomTo(view.zoom, !isReducedMotion)
      workstationAgentRef.current = agent.agentKey
      workstationSpecRef.current = workstation
      // A workstation stays with the reserved seat, even when its worker visits a lounge.
      followRef.current = followAnchor(agent, floor.rooms)
      followElevationRef.current = floorElevation(floor)
    },
    framePlayer(position: { x: number; z: number }): void {
      rig.preparePreset()
      rig.frame(
        { minX: position.x, maxX: position.x, minZ: position.z, maxZ: position.z },
        {
          minZoom: BAND_ZOOM.desk,
          maxZoom: BAND_ZOOM.desk,
          height: 2.8,
          insets: latestRef.current.cityInsets
        }
      )
    },
    frameCity(): void {
      const { scene, floor, cityEnvelope } = latestRef.current
      rig.preparePreset()
      rig.frame(nearCityBounds({ scene, floor, envelope: cityEnvelope }), {
        maxZoom: BAND_ZOOM.building,
        minZoom: CITY_MIN_ZOOM,
        height: Math.max(
          scene.maxY ?? DEFAULT_SCENE_HEIGHT,
          cityEnvelope ? cityEnvelope.maxY - cityEnvelope.minY + 3 : 0
        ),
        elevation: cityEnvelope?.minY ?? 0,
        insets: latestRef.current.cityInsets
      })
      isCityFramingRef.current = true
    },
    fit(): void {
      if (latestRef.current.viewMode === 'city') return rig.frameCity()
      rig.preparePreset()
      isAutoFramingRef.current = true
      isCityFramingRef.current = false
      followRef.current = null
      rig.frameFloor()
    },
    floorFitZoom(): number {
      const { occupied: bounds, size: viewport } = latestRef.current
      const azimuth = controlsRef.current?.azimuthAngle ?? ISO_START_AZIMUTH
      const polar = controlsRef.current?.polarAngle ?? ISO_POLAR
      return frameBounds(bounds, viewport, {
        azimuth,
        polar,
        maxZoom: FLOOR_MAX_ZOOM,
        minZoom: CITY_MIN_ZOOM,
        height: latestRef.current.envelope
          ? latestRef.current.envelope.maxY - latestRef.current.envelope.minY
          : undefined,
        insets: latestRef.current.cityInsets
      }).zoom
    },
    minimumZoom(): number {
      const { scene, floor, size: viewport, cityInsets: insets, floorCount } = latestRef.current
      const pose = {
        azimuth: controlsRef.current?.azimuthAngle ?? ISO_START_AZIMUTH,
        polar: controlsRef.current?.polarAngle ?? ISO_POLAR
      }
      const cityZoom = frameBounds(
        boundsOfZone({ ...scene, x: scene.x ?? floor.x, z: scene.z ?? floor.z }),
        viewport,
        {
          ...pose,
          minZoom: CITY_MIN_ZOOM,
          maxZoom: BAND_ZOOM.building,
          height: scene.maxY ?? DEFAULT_SCENE_HEIGHT,
          insets
        }
      ).zoom
      if (latestRef.current.visibleFloors) return cityZoom * CITY_ZOOM_MARGIN
      return Math.min(
        buildingFraming(scene, floorCount, viewport, pose).zoom * 0.8,
        cityZoom * CITY_ZOOM_MARGIN
      )
    }
  }).current

  gesturesRef.current = useCameraGestures({
    controlsRef,
    isReducedMotion: props.isReducedMotion,
    isWalking: props.isWalking ?? false,
    onManualMove: rig.manualMove,
    onTransition: rig.startTransition,
    onFit: () => {
      if (latestRef.current.onFit) latestRef.current.onFit()
      else rig.fit()
    }
  })

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    controls.mouseButtons.left = ACTION.TRUCK
    // Native two-finger orbit + orthographic pinch; trackpad pinch uses the wheel anchor below.
    controls.mouseButtons.right = ACTION.ROTATE
    controls.mouseButtons.middle = ACTION.NONE
    controls.mouseButtons.wheel = ACTION.NONE
    controls.touches.one = ACTION.TOUCH_TRUCK
    controls.touches.two = ACTION.TOUCH_ZOOM_ROTATE
    controls.touches.three = ACTION.NONE
    controls.truckSpeed = 1
    controls.dollyToCursor = true
    controls.addEventListener('controlstart', rig.manualMove)
    return () => controls.removeEventListener('controlstart', rig.manualMove)
  }, [rig])

  // The camera follows the player from here on, so framing the floor by itself would fight it.
  const { isWalking } = props
  useEffect(() => {
    if (isWalking) {
      rig.preparePreset()
    }
  }, [isWalking, rig])

  const { isReducedMotion } = props
  useEffect(() => {
    if (controlsRef.current)
      controlsRef.current.draggingSmoothTime = isReducedMotion ? 0 : DRAG_SMOOTH_SEC
  }, [isReducedMotion])

  // Frame the occupied area on the first snapshot, an arrival or departure, and a resize, but
  // only until the owner has moved the camera: after that it is theirs until they press Fit.
  const framingFloorId =
    props.viewMode === 'office'
      ? focusedFloor.floorId
      : props.visibleFloors
        ? ''
        : props.floor.floorId
  const occupiedKey = `${framingFloorId}:${Object.values(occupied).map(Math.round).join(',')}:${envelope?.minY}:${envelope?.maxY}`
  const sceneKey = JSON.stringify(props.scene)
  const envelopeKey = JSON.stringify(envelope)
  useEffect(() => {
    bandZoomRef.current = Number.NaN
    if (isCityFramingRef.current) rig.frameCity()
    else if (isAutoFramingRef.current) rig.frameFloor()
    else if (followRef.current && !hasMovedSinceFlyRef.current) {
      const agent = latestRef.current.agents.find(
        (candidate) => candidate.agentKey === followRef.current?.agentKey
      )
      if (agent && workstationAgentRef.current)
        rig.frameWorkstation(withLivePose(agent), workstationSpecRef.current ?? undefined)
      else if (agent && bandRef.current === 'desk') rig.frameAgent(withLivePose(agent))
    }
  }, [occupiedKey, sceneKey, envelopeKey, size.width, size.height, cityInsets, rig])

  // The fit that separates floor from building depends on this floor, so the band is re-read
  // whenever the zoom moves (or the effect above resets the cache).
  useFrame(() => {
    const controls = controlsRef.current
    const azimuth = controls?.azimuthAngle ?? ISO_START_AZIMUTH
    const polar = controls?.polarAngle ?? ISO_POLAR
    const poseKey = `${azimuth}:${polar}`
    if (camera.zoom === bandZoomRef.current && poseKey === bandPoseRef.current) return
    bandZoomRef.current = camera.zoom
    bandPoseRef.current = poseKey
    if (controls) controls.minZoom = rig.minimumZoom()
    const band = bandForZoom(camera.zoom, bandRef.current, rig.floorFitZoom())
    if (band === bandRef.current) return
    // Zooming out of the desk level ends the desk follow.
    if (bandRef.current === 'desk' && !workstationAgentRef.current) followRef.current = null
    bandRef.current = band
    latestRef.current.onBandChange(band)
  })

  // Follow rides the live pose with the player's margin follow; a seated agent asks no frames.
  useFrame((_, deltaSec) => {
    const controls = controlsRef.current
    const { followedAgentKey, agents, size: viewport, isReducedMotion } = latestRef.current
    if (!controls || !isRidingRef.current || !followedAgentKey) return
    const agent = agents.find((candidate) => candidate.agentKey === followedAgentKey)
    if (!agent || agent.place === 'leaving') {
      isRidingRef.current = false
      return
    }
    const pose = livePose(officePoses, agent)
    controls.getTarget(targetScratch, false)
    const ride = followBody({
      body: { x: pose.x, y: pose.elevation + LOOK_HEIGHT, z: pose.z },
      view: {
        target: [targetScratch.x, targetScratch.y, targetScratch.z],
        zoom: camera.zoom,
        azimuth: controls.azimuthAngle,
        polar: controls.polarAngle
      },
      viewport,
      deltaSec,
      isReducedMotion,
      insets: latestRef.current.cityInsets
    })
    if (ride.target) void controls.moveTo(...ride.target, false)
    if (!ride.isSettled) invalidate()
  })

  // The mini-map's footprint reads this; the store ignores moves it could not show.
  useFrame(() => {
    const controls = controlsRef.current
    if (!controls) return
    controls.getTarget(viewScratch, false)
    const view = viewRef.current
    view.x = viewScratch.x
    view.y = viewScratch.y
    view.z = viewScratch.z
    view.zoom = camera.zoom
    view.azimuth = controls.azimuthAngle
    view.polar = controls.polarAngle
    view.width = latestRef.current.size.width
    view.height = latestRef.current.size.height
    officeView.write(view)
  })

  // At desk zoom, keep the followed agent's office in view when the floor re-packs, and go with it
  // to its lounge. Only a place that actually moved shifts the target, so the owner's own pan is
  // never interrupted.
  const followedFloor = cameraFloor
  const followedAgents = props.agents
  useEffect(() => {
    const controls = controlsRef.current
    const anchor = followRef.current
    if (!controls || !anchor || (bandRef.current !== 'desk' && !workstationAgentRef.current)) return
    const followedAgent = followedAgents.find((agent) => agent.agentKey === anchor.agentKey)
    const anchorFloor = followedAgent
      ? floorForAgent({
          agent: followedAgent,
          floors: latestRef.current.visibleFloors,
          fallback: followedFloor,
          purpose: workstationAgentRef.current ? 'home' : 'presence'
        })
      : followedFloor
    let elevation = followElevationRef.current
    if (followedAgent)
      elevation = workstationAgentRef.current
        ? floorElevation(anchorFloor)
        : agentElevation(followedAgent)
    const dy = elevation - followElevationRef.current
    followElevationRef.current = elevation
    const step = followStep(
      anchor,
      followedAgents,
      anchorFloor.rooms,
      workstationAgentRef.current ? undefined : loungesByRoom(anchorFloor.zones)
    )
    if (step.kind === 'stay') {
      if (dy !== 0) {
        const target = controls.getTarget(targetScratch)
        void controls.moveTo(target.x, target.y + dy, target.z, !latestRef.current.isReducedMotion)
      }
      return
    }
    if (step.kind === 'lost') {
      followRef.current = null
      // The view is the owner's once they have moved it; only an untouched fly-to falls back.
      if (!hasMovedSinceFlyRef.current) rig.fit()
      return
    }
    followRef.current = step.anchor
    const target = controls.getTarget(targetScratch)
    void controls.moveTo(
      target.x + step.dx,
      target.y + dy,
      target.z + step.dz,
      !latestRef.current.isReducedMotion
    )
  }, [followedFloor, followedAgents, rig, targetScratch])

  useCameraPresets({ ...props, controlsRef, gesturesRef, rig })

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      minPolarAngle={MIN_POLAR}
      maxPolarAngle={MAX_POLAR}
      // Allow the HUD-safe city fit even at compact widths and freely rotated azimuths.
      minZoom={rig.minimumZoom()}
      maxZoom={MAX_INSPECTION_ZOOM}
      smoothTime={0.3}
    />
  )
}
