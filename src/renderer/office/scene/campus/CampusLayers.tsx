import { useFrame } from '@react-three/fiber'
import { useCallback, useMemo } from 'react'
import type { MemoryNotes } from '../../../../shared/office/types'
import { usePrefersReducedMotion } from '../../hooks'
import type { SceneBox } from '../../logic/camera-bands'
import { campusRoomColors } from '../../logic/campus-colors'
import { campusGeometry, type CampusSpoke } from '../../logic/campus-geometry'
import { campusClock, type RunningRoom } from '../../logic/campus-motion'
import type { FloorGeometry } from '../../scene-model'
import type { OfficeTheme } from '../../themes/types'
import { CampusArcs } from './CampusArcs'
import { CampusCouriers } from './CampusCouriers'
import { BRAIN_CORE_Y_M, CampusHub } from './CampusHub'
import { CampusPackets } from './CampusPackets'
import { CampusSpokes } from './CampusSpokes'
import { CampusStars } from './CampusStars'

// A plate with no project (a spare floor) has no palette colour of its own.
const UNCLAIMED_CHIP = '#7d8aa8'

export interface CampusLayersProps {
  // Every physical floor in the frame; campusGeometry(floors) gives the hub and spokes.
  floors: readonly FloorGeometry[]
  theme: OfficeTheme
  // The sky box Horizon clips to, already wider than the ring.
  skyBox: SceneBox
  // The memory-notes count: the hub pulses when its newest time moves on.
  memory?: MemoryNotes
  // Running agents per room: a busier room's road packets run faster. Idle speed when absent.
  rooms?: readonly RunningRoom[]
}

// The one mount point for Campus-only scene layers; OfficeScene mounts it only in Campus.
export function CampusLayers({ floors, skyBox, memory, rooms }: CampusLayersProps) {
  const isReducedMotion = usePrefersReducedMotion()
  // The one tick for every Campus shader; the frame governor paces frames, so it never asks for one.
  useFrame((state) => campusClock.tick(state.clock.elapsedTime, isReducedMotion))
  // The Brain writes its memory flash here and the room arcs read it.
  const flash = useMemo(() => ({ value: 0 }), [])
  const { hub, spokes } = useMemo(() => campusGeometry(floors), [floors])
  const colors = useMemo(() => campusRoomColors(spokes), [spokes])
  const chipOf = useCallback(
    (spoke: CampusSpoke) =>
      (spoke.projectKey !== null && colors.get(spoke.projectKey)?.chip) || UNCLAIMED_CHIP,
    [colors]
  )
  const chipOfProject = useCallback(
    (projectKey: string | null) =>
      (projectKey !== null && colors.get(projectKey)?.chip) || UNCLAIMED_CHIP,
    [colors]
  )
  const core = useMemo(() => ({ x: hub.x, y: BRAIN_CORE_Y_M, z: hub.z }), [hub.x, hub.z])
  return (
    <>
      <CampusStars box={skyBox} />
      <CampusSpokes spokes={spokes} chipOf={chipOf} rooms={rooms} />
      <CampusArcs spokes={spokes} chipOf={chipOf} hub={hub} coreY={BRAIN_CORE_Y_M} flash={flash} />
      <CampusPackets spokes={spokes} core={core} chipOf={chipOfProject} rooms={rooms} />
      <CampusHub hub={hub} memory={memory} isReducedMotion={isReducedMotion} flash={flash} />
      <CampusCouriers spokes={spokes} chipOf={chipOf} isReducedMotion={isReducedMotion} />
    </>
  )
}
