import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { buildingPlaces, type BuildingPlaces } from '../logic/building-place'
import { cityClock, type CityClock } from '../logic/city-clock'
import { citySignalStore, type CitySignalStore } from '../logic/city-signal-store'

// Stages go to the place store only when a signal changed, stamped with the frame's time so a
// crossing seen live eases from where the spire stood.
export function createSpireStageFeed(
  signals: Pick<CitySignalStore, 'current' | 'version'>,
  places: Pick<BuildingPlaces, 'setStage'>,
  clock: Pick<CityClock, 'now'>
): () => void {
  let fedVersion: number | null = null
  return () => {
    const version = signals.version()
    if (version === fedVersion) return
    fedVersion = version
    const nowMs = clock.now()
    for (const [buildingId, signal] of signals.current().buildings)
      places.setStage(buildingId, signal.spireStage, nowMs)
  }
}

// Mounted before the marks, so every reader of `topAt` sees this frame's stage.
export function SpireStageFeed() {
  const sync = useMemo(() => createSpireStageFeed(citySignalStore, buildingPlaces, cityClock), [])
  useFrame(sync)
  return null
}
