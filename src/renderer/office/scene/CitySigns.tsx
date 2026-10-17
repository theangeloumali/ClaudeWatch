import { CameraControlsImpl } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { WorldVenue } from '../../../shared/office/world-document'
import { buildingPlaces } from '../logic/building-place'
import { cityClock } from '../logic/city-clock'
import { projectSigns } from '../logic/project-signs'
import type { ThemePalette } from '../themes/types'
import {
  createCitySignsLayer,
  projectSignHosts,
  venueSignHosts,
  type SignHost
} from './city-signs-layer'
import { createSignAtlas } from './sign-atlas'

const NO_VENUES: readonly WorldVenue[] = []

// Outside every batch: textured and per-instance. Signs re-pose only when the camera turns or
// zooms, a sign changes, or a roof under one moves.
export function CitySigns({
  venues = NO_VENUES,
  palette
}: {
  venues?: readonly WorldVenue[]
  palette: ThemePalette
}) {
  const controls = useThree((state) => state.controls)
  const layer = useMemo(() => createCitySignsLayer(createSignAtlas()), [])
  useEffect(() => () => layer.dispose(), [layer])
  const isCameraMoved = useRef(true)
  const hasControls = controls instanceof CameraControlsImpl
  useEffect(() => {
    if (!(controls instanceof CameraControlsImpl)) return
    const markMoved = (): void => {
      isCameraMoved.current = true
    }
    controls.addEventListener('update', markMoved)
    return () => controls.removeEventListener('update', markMoved)
  }, [controls])
  const venueHosts = useMemo(() => venueSignHosts(venues, palette), [venues, palette])
  const hosts = useRef<{ version: number; venueHosts: SignHost[]; all: SignHost[] }>({
    version: -1,
    venueHosts,
    all: []
  })
  useFrame(({ camera }) => {
    const version = projectSigns.version()
    if (version !== hosts.current.version || venueHosts !== hosts.current.venueHosts)
      hosts.current = {
        version,
        venueHosts,
        all: [...projectSignHosts(projectSigns), ...venueHosts]
      }
    layer.update({
      hosts: hosts.current.all,
      camera,
      nowMs: cityClock.now(),
      isPinned: cityClock.isPinned(),
      // With no camera-controls nothing reports a move, so each frame compares the pose.
      isCameraMoved: isCameraMoved.current || !hasControls,
      places: buildingPlaces
    })
    isCameraMoved.current = false
  })
  return <primitive object={layer.group} />
}
