import type { SceneBox } from '../../logic/camera-bands'
import type { FloorGeometry } from '../../scene-model'
import type { OfficeTheme } from '../../themes/types'
import { CampusStars } from './CampusStars'

export interface CampusLayersProps {
  // Every physical floor in the frame; campusGeometry(floors) gives the hub and spokes.
  floors: readonly FloorGeometry[]
  theme: OfficeTheme
  // The sky box Horizon clips to, already wider than the ring.
  skyBox: SceneBox
}

// The one mount point for Campus-only scene layers; OfficeScene mounts it only in Campus.
export function CampusLayers({ skyBox }: CampusLayersProps) {
  return <CampusStars box={skyBox} />
}
