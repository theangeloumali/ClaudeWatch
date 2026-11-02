import { box, cylinder, lit, sphere, type PartSpec } from '../parts'
import { CORPORATE_MATERIALS, CORPORATE_PALETTE } from '../corporate-city/palette'
import {
  BOOK_COLORS,
  CHART_SCREEN_COLOR,
  CUSHION_COLOR,
  NIGHT_CAMPUS_PALETTE,
  SOFA_COLOR
} from './palette'

// Furniture every campus room shares: back against z = 0, facing +z into the room.
export interface Prop {
  parts: readonly PartSpec[]
  size: { width: number; depth: number }
}

export const BOOKSHELF: Prop = {
  size: { width: 1.2, depth: 0.32 },
  parts: [
    box([0, 0.85, 0.02], [1.2, 1.7, 0.04], CORPORATE_PALETTE.wood),
    ...[-0.58, 0.58].map((across) =>
      box([across, 0.85, 0.16], [0.04, 1.7, 0.32], CORPORATE_PALETTE.wood)
    ),
    ...[0.04, 0.62, 1.2, 1.68].map((up) =>
      box([0, up, 0.16], [1.2, 0.04, 0.32], CORPORATE_PALETTE.wood)
    ),
    ...[0.06, 0.64].flatMap((shelf, row) =>
      BOOK_COLORS.map((color, index) => {
        const height = 0.34 + ((index + row) % 3) * 0.06
        return box([-0.44 + index * 0.21, shelf + height / 2, 0.15], [0.16, height, 0.22], color)
      })
    )
  ]
}

export const SOFA: Prop = {
  size: { width: 1.8, depth: 0.8 },
  parts: [
    box([0, 0.22, 0.42], [1.8, 0.3, 0.76], SOFA_COLOR),
    box([0, 0.6, 0.12], [1.8, 0.5, 0.2], SOFA_COLOR),
    ...[-0.82, 0.82].map((across) => box([across, 0.42, 0.42], [0.16, 0.34, 0.76], SOFA_COLOR)),
    ...[-0.38, 0.38].map((across) => box([across, 0.42, 0.46], [0.7, 0.1, 0.58], CUSHION_COLOR))
  ]
}

// Dark screen high on the wall; nothing stands under it, so it needs no clearance.
export const CHART_SCREEN: readonly PartSpec[] = [
  box([0, 1.5, 0.025], [1.4, 0.78, 0.05], CORPORATE_PALETTE.ink),
  box([0, 1.5, 0.055], [1.28, 0.66, 0.012], CHART_SCREEN_COLOR),
  ...BOOK_COLORS.slice(1, 4).map((color, index) => {
    const height = 0.22 + index * 0.13
    return lit(box([-0.36 + index * 0.36, 1.24 + height / 2, 0.064], [0.22, height, 0.008], color))
  })
]

export const FLOOR_LAMP: readonly PartSpec[] = [
  cylinder([0, 0.02, 0], [0.3, 0.04, 0.3], CORPORATE_MATERIALS.frame),
  cylinder([0, 0.78, 0], [0.04, 1.5, 0.04], CORPORATE_MATERIALS.frame),
  lit(sphere([0, 1.5, 0], [0.16, 0.16, 0.16], NIGHT_CAMPUS_PALETTE.glow)),
  cylinder([0, 1.6, 0], [0.38, 0.28, 0.38], CORPORATE_PALETTE.steam)
]

export const PLANT: readonly PartSpec[] = [
  cylinder([0, 0.17, 0], [0.34, 0.34, 0.34], CORPORATE_PALETTE.paper),
  sphere([0, 0.56, 0], [0.5, 0.5, 0.5], CORPORATE_MATERIALS.foliage)
]
