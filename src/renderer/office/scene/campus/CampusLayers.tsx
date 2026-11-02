import { useCallback, useMemo } from 'react'
import type { MemoryNotes } from '../../../../shared/office/types'
import { usePrefersReducedMotion } from '../../hooks'
import type { SceneBox } from '../../logic/camera-bands'
import { campusRoomColors } from '../../logic/campus-colors'
import { campusGeometry, type CampusSpoke } from '../../logic/campus-geometry'
import type { FloorGeometry } from '../../scene-model'
import type { OfficeTheme } from '../../themes/types'
import { CampusCouriers } from './CampusCouriers'
import { CampusHub } from './CampusHub'
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
}

// The one mount point for Campus-only scene layers; OfficeScene mounts it only in Campus.
export function CampusLayers({ floors, skyBox, memory }: CampusLayersProps) {
  const isReducedMotion = usePrefersReducedMotion()
  const { hub, spokes } = useMemo(() => campusGeometry(floors), [floors])
  const colors = useMemo(() => campusRoomColors(spokes), [spokes])
  const chipOf = useCallback(
    (spoke: CampusSpoke) =>
      (spoke.projectKey !== null && colors.get(spoke.projectKey)?.chip) || UNCLAIMED_CHIP,
    [colors]
  )
  return (
    <>
      <CampusStars box={skyBox} />
      <CampusSpokes spokes={spokes} chipOf={chipOf} />
      <CampusHub hub={hub} memory={memory} isReducedMotion={isReducedMotion} />
      <CampusCouriers spokes={spokes} chipOf={chipOf} isReducedMotion={isReducedMotion} />
    </>
  )
}
