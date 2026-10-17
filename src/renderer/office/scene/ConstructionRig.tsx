import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { cityEvents } from '../../office-live/city-events'
import { buildingPlaces } from '../logic/building-place'
import { cityClock } from '../logic/city-clock'
import { readQualityLevel } from '../quality-store'
import type { FloorGeometry } from '../scene-model'
import type { OfficeTheme } from '../themes/types'
import { createConstructionRigLayer } from './construction-rig-layer'

// A crane hoists each new spire stage for 3 s. Outside every batch, so a quality step mid-hoist
// changes this layer alone; the level is read per frame and commits nothing.
export function ConstructionRig({
  floors,
  theme
}: {
  floors: readonly FloorGeometry[]
  theme: OfficeTheme
}) {
  const layer = useMemo(() => createConstructionRigLayer(theme), [theme])
  useEffect(() => () => layer.dispose(), [layer])
  const buildings = useMemo(
    () => Map.groupBy(floors, (floor) => floor.buildingId ?? floor.floorId),
    [floors]
  )
  useFrame(() => {
    const nowMs = cityClock.now()
    const isPinned = cityClock.isPinned()
    layer.update({
      events: cityEvents.active(),
      floorsOf: (buildingId) => buildings.get(buildingId),
      places: buildingPlaces,
      nowMs,
      isPinned,
      level: readQualityLevel()
    })
  })
  return <primitive object={layer.group} />
}
