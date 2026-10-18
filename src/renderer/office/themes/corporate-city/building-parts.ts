import type { ZonePlot } from '../../town/town-dress'
import { draw } from '../lot-math'
import { box, type PartSpec } from '../parts'
import { CORPORATE_MATERIALS as materials } from './palette'

// Each normalized façade axis fits the lot independently, including narrow frontage.
export function fitParts(plot: ZonePlot, parts: readonly PartSpec[]): PartSpec[] {
  return parts.map((part) => ({
    ...part,
    at: [part.at[0] * plot.width, part.at[1] * plot.height, part.at[2] * plot.depth],
    size: [part.size[0] * plot.width, part.size[1] * plot.height, part.size[2] * plot.depth]
  }))
}

export function wing(volume: PartSpec): PartSpec[] {
  const [x, y, z] = volume.at
  const [width, height, depth] = volume.size
  const front = z + depth / 2
  const top = y + height / 2
  return [
    box(volume.at, volume.size, materials.facade),
    box([x, y, front + 0.006], [width * 0.86, height * 0.7, 0.012], materials.glass),
    box([x + width / 2 + 0.005, y, z], [0.01, height * 0.68, depth * 0.72], materials.glass),
    box([x, top + 0.012, z], [width + 0.018, 0.024, depth + 0.018], volume.color),
    box([x, top + 0.025, z], [width * 0.86, 0.008, depth * 0.84], materials.roof),
    box(
      [x, y - height * 0.31, front + 0.008],
      [width * 0.18, height * 0.32, 0.014],
      materials.frame
    ),
    ...[-0.32, 0, 0.32].map((bay) =>
      box(
        [x + width * bay, y, front + 0.028],
        [width * 0.035, height * 0.82, 0.04],
        materials.frame
      )
    ),
    box(
      [x, y + height * 0.08, front + 0.017],
      [width * 0.9, height * 0.035, 0.02],
      materials.facade
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
