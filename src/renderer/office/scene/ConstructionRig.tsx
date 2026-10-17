import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { cityEvents } from '../../office-live/city-events'
import { buildingPlaces } from '../logic/building-place'
import { cityClock } from '../logic/city-clock'
import { readQualityLevel } from '../quality-store'
import type { FloorGeometry } from '../scene-model'
import type { OfficeTheme } from '../themes/types'
import { buildingKeyOf, groundAndTop, type BuildingStoreys } from './all-floor-model'
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
  const storeys = useMemo(() => {
    const byBuilding = new Map<string, BuildingStoreys>()
    for (const [buildingId, storeyList] of Map.groupBy(floors, buildingKeyOf)) {
      const ends = groundAndTop(storeyList)
      if (ends) byBuilding.set(buildingId, ends)
    }
    return byBuilding
  }, [floors])
  useFrame(() =>
    layer.update({
      events: cityEvents.active(),
      storeys,
      places: buildingPlaces,
      nowMs: cityClock.now(),
      isPinned: cityClock.isPinned(),
      level: readQualityLevel()
    })
  )
  return <primitive object={layer.mesh} />
}
