import { box, cylinder, lit, sphere, type PartSpec } from '../parts'
import { CORPORATE_MATERIALS, CORPORATE_PALETTE } from '../corporate-city/palette'
import {
  BOOK_COLORS,
  CHART_SCREEN_COLOR,
  CUSHION_COLOR,
  LAMP_SHADE_COLOR,
  NIGHT_CAMPUS_PALETTE,
  PLANT_GREEN,
  SOFA_COLOR
} from './palette'

// Room props match the scaled-up desks, so they still read at the overview zoom.
export const PROP_SCALE = 1.4

// Furniture every campus room shares: back against z = 0, facing +z into the room.
export interface Prop {
  parts: readonly PartSpec[]
  size: { width: number; depth: number }
}

const scaled = (parts: readonly PartSpec[]): PartSpec[] =>
  parts.map((part) => ({
    ...part,
    at: [part.at[0] * PROP_SCALE, part.at[1] * PROP_SCALE, part.at[2] * PROP_SCALE],
    size: [part.size[0] * PROP_SCALE, part.size[1] * PROP_SCALE, part.size[2] * PROP_SCALE]
  }))

const scaledProp = (size: Prop['size'], parts: readonly PartSpec[]): Prop => ({
  size: { width: size.width * PROP_SCALE, depth: size.depth * PROP_SCALE },
  parts: scaled(parts)
})

export const BOOKSHELF: Prop = scaledProp({ width: 1.2, depth: 0.32 }, [
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
])

export const SOFA: Prop = scaledProp({ width: 1.8, depth: 0.8 }, [
  box([0, 0.22, 0.42], [1.8, 0.3, 0.76], SOFA_COLOR),
  box([0, 0.6, 0.12], [1.8, 0.5, 0.2], SOFA_COLOR),
  ...[-0.82, 0.82].map((across) => box([across, 0.42, 0.42], [0.16, 0.34, 0.76], SOFA_COLOR)),
  ...[-0.38, 0.38].map((across) => box([across, 0.42, 0.46], [0.7, 0.1, 0.58], CUSHION_COLOR))
])

// Dark screen high on the wall; nothing stands under it, so it needs no clearance.
export const CHART_SCREEN: readonly PartSpec[] = scaled([
  box([0, 1.3, 0.025], [1.4, 0.78, 0.05], CORPORATE_PALETTE.ink),
  box([0, 1.3, 0.055], [1.28, 0.66, 0.012], CHART_SCREEN_COLOR),
  ...BOOK_COLORS.slice(1, 4).map((color, index) => {
    const height = 0.22 + index * 0.13
    return lit(box([-0.36 + index * 0.36, 1.04 + height / 2, 0.064], [0.22, height, 0.008], color))
  })
])

// The shade glows too: at the overview zoom a lit shade reads where a small bulb would not.
export const FLOOR_LAMP: readonly PartSpec[] = scaled([
  cylinder([0, 0.02, 0], [0.3, 0.04, 0.3], CORPORATE_MATERIALS.frame),
  cylinder([0, 0.78, 0], [0.04, 1.5, 0.04], CORPORATE_MATERIALS.frame),
  lit(sphere([0, 1.46, 0], [0.2, 0.2, 0.2], NIGHT_CAMPUS_PALETTE.glow)),
  lit(cylinder([0, 1.58, 0], [0.42, 0.3, 0.42], LAMP_SHADE_COLOR))
])

export const PLANT: readonly PartSpec[] = scaled([
  cylinder([0, 0.2, 0], [0.42, 0.4, 0.42], CORPORATE_PALETTE.paper),
  sphere([0, 0.72, 0], [0.8, 0.8, 0.8], PLANT_GREEN),
  sphere([0.16, 1.02, -0.06], [0.5, 0.5, 0.5], PLANT_GREEN)
])
export const PLANT_SPREAD_M = 0.8 * PROP_SCALE
