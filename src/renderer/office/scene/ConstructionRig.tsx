import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { cityEvents } from '../../office-live/city-events'
import { buildingPlaces } from '../logic/building-place'
import { cityClock } from '../logic/city-clock'
import { levelInUse } from '../logic/quality'
import { readQuality } from '../quality-store'
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
    const { pin, chosen } = readQuality()
    layer.update({
      events: cityEvents.active(nowMs),
      floorsOf: (buildingId) => buildings.get(buildingId),
      places: buildingPlaces,
      nowMs,
      isPinned: cityClock.isPinned(),
      level: levelInUse(pin, chosen)
    })
  })
  return <primitive object={layer.group} />
}
