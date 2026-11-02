import { useMemo } from 'react'
import type { CampusRoomColors } from '../../logic/campus-colors'
import type { FloorGeometry } from '../../scene-model'
import { floorElevation } from '../../scene/all-floor-model'
import { Parts } from '../parts'
import { campusRoomParts } from './room-parts'

export function NightCampusRoom({
  floor,
  colors
}: {
  floor: FloorGeometry
  colors: CampusRoomColors
}) {
  const parts = useMemo(() => campusRoomParts(floor, colors), [floor, colors])
  return (
    <group position={[0, floorElevation(floor), 0]}>
      <Parts parts={parts} />
    </group>
  )
}
