import { FACADE_LAYER_STEP_M } from '../../scene/building-window-parts'
import type { ZonePlot } from '../../town/town-dress'
import { draw } from '../lot-math'
import { box, type PartSpec } from '../parts'
import type { Vector } from '../primitives'
import { CORPORATE_MATERIALS as materials } from './palette'

// Each normalized façade axis fits the lot independently, including narrow frontage.
export function fitParts(plot: ZonePlot, parts: readonly PartSpec[]): PartSpec[] {
  return parts.map((part) => ({
    ...part,
    at: [part.at[0] * plot.width, part.at[1] * plot.height, part.at[2] * plot.depth],
    size: [part.size[0] * plot.width, part.size[1] * plot.height, part.size[2] * plot.depth]
  }))
}

// Metres per storey, so bands read as floors at any lot height; few bands, so towers read as floors.
const STOREY_M = 3.2
const MAX_BANDS = 7
const CURTAIN_OFFSET = 0.006
const GLASS_DEPTH = 0.012

type LotSize = Pick<ZonePlot, 'width' | 'depth' | 'height'>

interface CurtainFace {
  at: Vector
  span: number
  axis: 'x' | 'z'
}

interface CurtainSpan {
  bottom: number
  height: number
  storeys: number
  plot: LotSize
}

// flicker-1: the layer step is metric but parts are unit space, so it is divided per axis.
function curtain(face: CurtainFace, { bottom, height, storeys, plot }: CurtainSpan): PartSpec[] {
  const [faceX, , faceZ] = face.at
  const step = FACADE_LAYER_STEP_M / (face.axis === 'z' ? plot.depth : plot.width)
  const stepUp = FACADE_LAYER_STEP_M / plot.height
  const glassHigh = height * 0.78
  const glassLow = bottom + height * 0.12
  const across = (offset: number, lift: number): Vector =>
    face.axis === 'z' ? [faceX + offset, lift, faceZ] : [faceX, lift, faceZ + offset]
  const size = (span: number, tall: number, layer: number): Vector =>
    face.axis === 'z' ? [span, tall, layer] : [layer, tall, span]
  const bands = Math.min(MAX_BANDS, Math.max(0, storeys - 1))
  return [
    box(
      across(0, glassLow + glassHigh / 2),
      size(face.span * 0.86, glassHigh, GLASS_DEPTH),
      materials.glass
    ),
    ...Array.from({ length: bands }, (_, band) =>
      box(
        across(0, glassLow + (glassHigh * (band + 1)) / (bands + 1)),
        size(face.span * 0.88, glassHigh * 0.035, GLASS_DEPTH + 2 * step),
        materials.facade
      )
    ),
    // Mullions stop a step short of the glass top so the two never tie.
    ...[-0.3, 0, 0.3].map((bay) =>
      box(
        across(face.span * bay, glassLow + glassHigh / 2),
        size(face.span * 0.02, glassHigh - 2 * stepUp, GLASS_DEPTH + 4 * step),
        materials.frame
      )
    )
  ]
}

// A storeyed volume finished on every side: a banded glass curtain on each face.
export function wing(volume: PartSpec, plot: LotSize): PartSpec[] {
  const [x, y, z] = volume.at
  const [width, height, depth] = volume.size
  const front = z + depth / 2
  const top = y + height / 2
  const span: CurtainSpan = {
    bottom: y - height / 2,
    height,
    storeys: Math.max(1, Math.round((height * plot.height) / STOREY_M)),
    plot
  }
  const faces: readonly CurtainFace[] = [
    { at: [x, 0, front + CURTAIN_OFFSET], span: width, axis: 'z' },
    { at: [x, 0, z - depth / 2 - CURTAIN_OFFSET], span: width, axis: 'z' },
    { at: [x + width / 2 + CURTAIN_OFFSET, 0, z], span: depth, axis: 'x' },
    { at: [x - width / 2 - CURTAIN_OFFSET, 0, z], span: depth, axis: 'x' }
  ]
  return [
    box(volume.at, volume.size, materials.facade),
    ...faces.flatMap((face) => curtain(face, span)),
    box([x, top + 0.012, z], [width + 0.018, 0.024, depth + 0.018], volume.color),
    box([x, top + 0.025, z], [width * 0.86, 0.008, depth * 0.84], materials.roof),
    box(
      [x, y - height * 0.31, front + 0.008],
      [width * 0.18, height * 0.32, 0.014],
      materials.frame
    )
  ]
}

export function plaza(): PartSpec[] {
  return [
    box([0, 0.018, 0], [0.96, 0.036, 0.96], materials.concrete),
    ...[-1, 1].flatMap((side) => [
      box([side * 0.32, 0.085, 0.37], [0.18, 0.1, 0.14], materials.facade),
      box([side * 0.32, 0.145, 0.37], [0.15, 0.04, 0.11], materials.foliage)
    ])
  ]
}

export function roofService(plot: ZonePlot, roofTop: number): PartSpec[] {
  const offset = (draw(plot.seed, 9) - 0.5) * 0.12
  return [
    box([offset, roofTop + 0.065, -0.18], [0.18, 0.07, 0.16], materials.roof),
    box([offset, roofTop + 0.104, -0.18], [0.14, 0.008, 0.12], materials.frame)
  ]
}
