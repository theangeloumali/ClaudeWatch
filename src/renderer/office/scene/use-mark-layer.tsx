import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, type ComponentType, type ReactElement } from 'react'
import type { Camera, Object3D } from 'three'
import type { ZoomBand } from '../logic/camera-bands'
import { useQualityLevel } from '../quality-store'
import type { ThemePalette } from '../themes/types'
import { isMarkLevel, readCityMarks, type CityMarkFrame } from './city-marks'

interface MarkLayer {
  mesh: Object3D
  dispose(): void
}

export interface MarkLayerProps {
  palette: ThemePalette
  band: ZoomBand
}

// Every city mark: built per palette, drawn from the module stores each frame, so an idle city
// commits nothing to React.
export function useMarkLayer<Layer extends MarkLayer>(
  create: (palette: ThemePalette) => Layer,
  draw: (layer: Layer, frame: CityMarkFrame, camera: Camera) => void,
  { palette, band }: MarkLayerProps
): ReactElement {
  const layer = useMemo(() => create(palette), [create, palette])
  useEffect(() => () => layer.dispose(), [layer])
  useFrame(({ camera }) => draw(layer, readCityMarks(band, camera.zoom), camera))
  return <primitive object={layer.mesh} />
}

// Light mounts no mark at all, so it asks for no frame work either.
export function markGated<Props extends object>(Mesh: ComponentType<Props>) {
  return function MarkGate(props: Props) {
    return isMarkLevel(useQualityLevel()) ? <Mesh {...props} /> : null
  }
}
