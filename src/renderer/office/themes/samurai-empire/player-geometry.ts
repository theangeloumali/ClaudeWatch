import { ConeGeometry, RingGeometry, type BufferGeometry } from 'three'
import { CITIZEN_SCALE } from '../../../../shared/office/figure-scale'
import { citizenGeometry } from '../../citizens/figure-parts'
import { MARKER_Y } from '../../player/figure'
import type { ThemePalette } from '../types'
import { selectSamuraiAppearance } from './armor'
import { samuraiFigureParts } from './figure-geometry'

const OWNER_SCALE = 1.6

export function samuraiPlayerGeometry(palette: ThemePalette): BufferGeometry {
  const appearance = { ...selectSamuraiAppearance('samurai-empire-owner'), armor: palette.lacquer }
  const parts = samuraiFigureParts(appearance).map((part) => ({
    ...part,
    geometry: part.geometry.scale(OWNER_SCALE, OWNER_SCALE, OWNER_SCALE)
  }))
  parts.push(
    {
      geometry: new RingGeometry(0.48, 0.61, 24).rotateX(-Math.PI / 2).translate(0, 0.018, 0),
      color: palette.glow
    },
    {
      geometry: new ConeGeometry(0.18, 0.32, 4).rotateX(Math.PI).translate(0, MARKER_Y, 0),
      color: palette.glow
    }
  )
  // The merger disposes temporary buffers; the caller owns the returned geometry.
  return citizenGeometry({ name: 'Samurai owner', parts: () => parts }).scale(
    1 / CITIZEN_SCALE,
    1 / CITIZEN_SCALE,
    1 / CITIZEN_SCALE
  )
}
