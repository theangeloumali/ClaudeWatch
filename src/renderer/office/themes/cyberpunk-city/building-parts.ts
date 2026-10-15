import { fitParts } from '../corporate-city/building-parts'
import { box, lit, type PartSpec } from '../parts'
import type { ZonePlot } from '../../town/town-dress'
import { CYBERPUNK_MATERIALS as material } from './palette'

export { fitParts }

// Facade attachments stay inside the normalized lot; only bounded panels emit light.
export function industrialWing(volume: PartSpec): PartSpec[] {
  const [across, height, along] = volume.at
  const [width, rise, depth] = volume.size
  const front = along + depth / 2
  const base = height - rise / 2
  return [
    volume,
    box(
      [across, height + rise * 0.08, front + 0.005],
      [width * 0.84, rise * 0.64, 0.01],
      material.glass
    ),
    ...[-0.08, 0.2].flatMap((level) =>
      [-0.24, 0.24].map((bay) =>
        lit(
          box(
            [across + width * bay, height + rise * level, front + 0.012],
            [width * 0.32, rise * 0.16, 0.012],
            level < 0 && bay < 0 ? material.amber : material.cyan
          )
        )
      )
    ),
    ...[0.08].map((level) =>
      box(
        [across, height + rise * level, front + 0.025],
        [width * 0.94, 0.018, 0.065],
        material.equipment
      )
    ),
    box([across, height + rise / 2 - 0.013, along], [width, 0.026, depth], material.graphite),
    box(
      [across, base + rise * 0.16, front + 0.014],
      [width * 0.19, rise * 0.26, 0.018],
      material.graphite
    ),
    lit(
      box(
        [across, base + rise * 0.19, front + 0.015],
        [width * 0.7, rise * 0.17, 0.016],
        material.amber
      )
    ),
    box([across, base + rise * 0.34, front + 0.04], [width * 0.96, 0.022, 0.08], material.graphite)
  ]
}

export function industrialPad(): PartSpec {
  return box([0, 0.02, 0], [0.98, 0.04, 0.98], material.concrete)
}

export function relayTower(plot: ZonePlot): PartSpec[] {
  return fitParts(plot, [
    industrialPad(),
    ...industrialWing(box([-0.1, 0.47, -0.12], [0.52, 0.86, 0.6], material.graphite)),
    ...industrialWing(box([0.25, 0.3, -0.08], [0.22, 0.52, 0.52], material.facade)),
    box([-0.41, 0.48, -0.12], [0.07, 0.88, 0.59], material.equipment),
    lit(box([-0.31, 0.63, 0.204], [0.095, 0.39, 0.026], material.cyan)),
    lit(box([0.25, 0.49, 0.209], [0.19, 0.08, 0.026], material.pink)),
    box([-0.1, 0.94, -0.14], [0.22, 0.08, 0.18], material.equipment),
    box([0, 0.22, 0.28], [0.64, 0.035, 0.2], material.graphite)
  ])
}

export function repairGarage(plot: ZonePlot): PartSpec[] {
  return fitParts(plot, [
    industrialPad(),
    box([0, 0.39, -0.18], [0.88, 0.7, 0.5], material.facade),
    box([0, 0.77, -0.11], [0.94, 0.06, 0.68], material.graphite),
    ...[-1, 1].flatMap((bay) => [
      box([bay * 0.22, 0.3, 0.084], [0.36, 0.46, 0.028], material.graphite),
      box([bay * 0.22, 0.085, 0.24], [0.32, 0.05, 0.28], material.concrete),
      lit(box([bay * 0.22, 0.38, 0.108], [0.27, 0.12, 0.018], material.cyan)),
      box([bay * 0.22, 0.57, 0.17], [0.39, 0.035, 0.23], material.equipment)
    ]),
    lit(box([0, 0.69, 0.111], [0.66, 0.09, 0.026], material.amber)),
    lit(box([-0.38, 0.52, 0.128], [0.075, 0.28, 0.028], material.pink)),
    box([0.43, 0.36, -0.16], [0.055, 0.62, 0.4], material.equipment),
    box([0.27, 0.85, -0.19], [0.2, 0.1, 0.18], material.equipment)
  ])
}

export function transitInterchange(plot: ZonePlot): PartSpec[] {
  return fitParts(plot, [
    industrialPad(),
    box([0, 0.1, -0.05], [0.86, 0.12, 0.72], material.steel),
    ...[-1, 1].flatMap((side) =>
      [-1, 1].map((end) =>
        box([side * 0.35, 0.47, end * 0.28], [0.045, 0.74, 0.05], material.steel)
      )
    ),
    box([0, 0.86, -0.02], [0.92, 0.065, 0.78], material.graphite),
    lit(box([0, 0.8, 0.365], [0.66, 0.09, 0.026], material.cyan)),
    lit(box([0, 0.819, 0], [0.65, 0.012, 0.025], material.amber)),
    box([0, 0.71, -0.26], [0.73, 0.09, 0.025], material.glass),
    box([0.26, 0.46, 0.2], [0.1, 0.32, 0.06], material.equipment),
    lit(box([0.26, 0.56, 0.238], [0.055, 0.1, 0.015], material.cyan)),
    box([-0.12, 0.28, -0.08], [0.38, 0.045, 0.14], material.amber)
  ])
}

export function stackedHousing(plot: ZonePlot): PartSpec[] {
  return fitParts(plot, [
    industrialPad(),
    ...[-1, 1].flatMap((side) =>
      industrialWing(
        box(
          [side * 0.23, side < 0 ? 0.38 : 0.45, -0.09],
          [0.38, side < 0 ? 0.68 : 0.82, 0.64],
          side < 0 ? material.facade : material.graphite
        )
      )
    ),
    ...[0.3, 0.53, 0.75].flatMap((level) => [
      box([0.23, level, 0.28], [0.4, 0.025, 0.2], material.equipment),
      box([0.23, level + 0.045, 0.371], [0.38, 0.065, 0.018], material.graphite)
    ]),
    lit(box([-0.35, 0.52, 0.276], [0.075, 0.34, 0.026], material.pink)),
    box([-0.23, 0.76, -0.12], [0.18, 0.08, 0.24], material.equipment),
    box([0.26, 0.9, -0.18], [0.18, 0.08, 0.18], material.equipment)
  ])
}

export function pocketGarden(plot: ZonePlot): PartSpec[] {
  return fitParts(plot, [
    industrialPad(),
    box([-0.18, 0.2, -0.1], [0.42, 0.33, 0.46], material.steel),
    box([-0.18, 0.61, -0.1], [0.35, 0.5, 0.36], material.foliage),
    box([0.23, 0.23, 0.28], [0.37, 0.09, 0.14], material.amber),
    box([0.23, 0.13, 0.28], [0.25, 0.12, 0.08], material.steel),
    box([0.31, 0.49, -0.24], [0.035, 0.9, 0.035], material.steel),
    lit(box([0.31, 0.94, -0.19], [0.17, 0.025, 0.15], material.amber))
  ])
}
