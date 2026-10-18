import type { CameraControlsImpl } from '@react-three/drei'
import { useEffect, useRef, type RefObject } from 'react'
import type { AgentView } from '../../../shared/office/types'
import { withLivePose } from '../../office-live/pose-store'
import {
  BAND_ZOOM,
  ISO_POLAR,
  ISO_START_AZIMUTH,
  nearestAzimuth,
  snapAzimuth,
  tiltPolar
} from '../logic/camera-bands'
import type { CameraRequest } from '../logic/office-reducer'
import { boundsOfZone, padBounds, type Bounds, type frameBounds } from '../logic/zone-framing'
import { findZone } from '../logic/zone-model'
import type { FloorGeometry } from '../scene-model'
import type { CameraGestures } from './use-camera-gestures'
import { floorElevation } from './all-floor-model'

const KEY_ZOOM_STEP = 1.25
const ZONE_PADDING_M = 1

// dry-new: preset command dispatch is separate from continuous camera ownership and fitting.
interface PresetOptions {
  controlsRef: RefObject<CameraControlsImpl | null>
  gesturesRef: RefObject<CameraGestures | null>
  request: CameraRequest | null
  agents: readonly AgentView[]
  floor: FloorGeometry
  visibleFloors: readonly FloorGeometry[]
  viewMode?: 'city' | 'office'
  focusedFloorId?: string | null
  isReducedMotion: boolean
  rig: {
    manualMove(): void
    startTransition(): void
    preparePreset(): void
    frame(bounds: Bounds, options: Parameters<typeof frameBounds>[2] & { elevation?: number }): void
    frameFloor(pose?: { azimuth: number; polar: number }): void
    frameAgent(agent: AgentView): void
    frameWorkstation(agent: AgentView): void
    frameCity(): void
    framePlayer(position: { x: number; z: number }): void
    fit(): void
  }
}

export function useCameraPresets(options: PresetOptions): void {
  const latestRef = useRef(options)
  latestRef.current = options
  const { request } = options
  useEffect(() => {
    const { controlsRef, gesturesRef, floor, visibleFloors, agents, rig, isReducedMotion } =
      latestRef.current
    const controls = controlsRef.current
    if (!request || !controls) return
    const isAnimated = !isReducedMotion
    switch (request.kind) {
      case 'zoom':
        gesturesRef.current?.zoomBy(request.direction === 'in' ? KEY_ZOOM_STEP : 1 / KEY_ZOOM_STEP)
        return
      case 'fit':
        return rig.fit()
      case 'reset':
      case 'office':
        rig.preparePreset()
        void controls.rotateTo(
          nearestAzimuth(controls.azimuthAngle, ISO_START_AZIMUTH),
          ISO_POLAR,
          isAnimated
        )
        return rig.frameFloor({ azimuth: ISO_START_AZIMUTH, polar: ISO_POLAR })
      case 'city':
        return rig.frameCity()
      case 'player':
        return rig.framePlayer(request.position)
      case 'rotate': {
        const azimuth = snapAzimuth(controls.azimuthAngle, request.direction)
        const polar = controls.polarAngle
        rig.manualMove()
        if (isAnimated) rig.startTransition()
        void controls.rotateTo(azimuth, polar, isAnimated)
        return
      }
      case 'tilt': {
        const azimuth = controls.azimuthAngle
        const polar = tiltPolar(controls.polarAngle, request.direction)
        rig.manualMove()
        if (isAnimated) rig.startTransition()
        void controls.rotateTo(azimuth, polar, isAnimated)
        return
      }
      case 'zone': {
        const zoneFloor =
          visibleFloors.find(
            (candidate) =>
              findZone(candidate, request.zoneId) ||
              candidate.rooms.some((room) => room.id === request.zoneId)
          ) ?? floor
        const zone =
          findZone(zoneFloor, request.zoneId) ??
          zoneFloor.rooms.find((room) => room.id === request.zoneId)
        if (!zone) return
        rig.preparePreset()
        return rig.frame(padBounds(boundsOfZone(zone), ZONE_PADDING_M), {
          azimuth: controls.azimuthAngle,
          polar: controls.polarAngle,
          maxZoom: BAND_ZOOM.desk,
          elevation: floorElevation(zoneFloor)
        })
      }
      case 'fly':
      case 'workstation': {
        const found = agents.find((candidate) => candidate.agentKey === request.agentKey)
        if (!found) return
        // A roamer is framed where it walks now, not where its last frame left it (perf-2).
        const agent = withLivePose(found)
        if (request.kind === 'workstation') return rig.frameWorkstation(agent)
        rig.preparePreset()
        return rig.frameAgent(agent)
      }
      default: {
        const unreachable: never = request
        return unreachable
      }
    }
  }, [request])
}
