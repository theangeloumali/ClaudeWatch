import type { ZonePlot } from '../../town/town-dress'
import { box, lit, type PartSpec } from '../parts'
import { fitParts, industrialPad, industrialWing } from './building-parts'
import { CYBERPUNK_MATERIALS as material } from './palette'

export function nightMarket(plot: ZonePlot): PartSpec[] {
  // Split frontages use fewer, broader bays rather than miniature shop details.
  const hasWideFrontage = plot.width >= 4
  const frontages = hasWideFrontage ? [-0.29, 0, 0.29] : [-0.22, 0.22]
  const bayWidth = hasWideFrontage ? 0.26 : 0.4
  return fitParts(plot, [
    industrialPad(),
    ...frontages.flatMap((across, index) => [
      box([across, 0.3, -0.15], [bayWidth, 0.52, 0.46], material.facade),
      box([across, 0.54, 0.16], [bayWidth + 0.025, 0.035, 0.29], material.graphite),
      box([across, 0.24, 0.24], [bayWidth * 0.88, 0.045, 0.2], material.equipment),
      box([across, 0.25, 0.091], [bayWidth * 0.19, 0.38, 0.018], material.graphite),
      ...[-1, 1].map((side) =>
        lit(
          box(
            [across + side * bayWidth * 0.25, 0.36, 0.095],
            [bayWidth * 0.27, 0.19, 0.014],
            material.amber
          )
        )
      ),
      lit(
        box(
          [across, 0.58, 0.315],
          [bayWidth * 0.92, 0.09, 0.026],
          index % 2 === 0 ? material.pink : material.cyan
        )
      )
    ]),
    box([0, 0.82, -0.31], [0.5, 0.21, 0.18], material.graphite),
    box([0, 0.79, 0.11], [0.86, 0.014, 0.014], material.equipment),
    box([-0.4, 0.67, 0.11], [0.022, 0.25, 0.022], material.equipment),
    box([0.4, 0.67, 0.11], [0.022, 0.25, 0.022], material.equipment),
    lit(box([0.33, 0.75, -0.01], [0.085, 0.33, 0.045], material.cyan))
  ])
}

export function foodCourt(plot: ZonePlot): PartSpec[] {
  return fitParts(plot, [
    industrialPad(),
    ...industrialWing(box([0, 0.38, -0.25], [0.84, 0.68, 0.38], material.facade)),
    box([0, 0.44, 0.1], [0.9, 0.04, 0.48], material.graphite),
    lit(box([0, 0.51, 0.13], [0.76, 0.105, 0.028], material.amber)),
    lit(box([-0.4, 0.63, -0.005], [0.07, 0.34, 0.03], material.pink)),
    box([0, 0.2, 0.13], [0.18, 0.3, 0.018], material.graphite),
    ...[-1, 1].flatMap((side) => [
      box([side * 0.26, 0.22, -0.015], [0.32, 0.36, 0.27], material.facade),
      lit(box([side * 0.26, 0.29, 0.129], [0.24, 0.15, 0.018], material.amber)),
      box([side * 0.23, 0.18, 0.4], [0.18, 0.035, 0.16], material.steel),
      box([side * 0.23, 0.1, 0.4], [0.025, 0.13, 0.025], material.graphite)
    ]),
    box([0.14, 0.8, -0.27], [0.22, 0.1, 0.15], material.equipment)
  ])
}

export function arcadeHall(plot: ZonePlot): PartSpec[] {
  return fitParts(plot, [
    industrialPad(),
    ...industrialWing(box([-0.07, 0.43, -0.1], [0.76, 0.78, 0.66], material.graphite)),
    lit(box([-0.3, 0.58, 0.277], [0.11, 0.43, 0.035], material.pink)),
    box([0.03, 0.26, 0.252], [0.22, 0.38, 0.038], material.graphite),
    box([0.03, 0.48, 0.3], [0.43, 0.035, 0.12], material.equipment),
    lit(box([0.03, 0.55, 0.33], [0.39, 0.11, 0.028], material.pink)),
    box([0.35, 0.19, 0.31], [0.13, 0.26, 0.1], material.equipment),
    lit(box([0.35, 0.28, 0.37], [0.095, 0.07, 0.015], material.cyan)),
    box([0.44, 0.55, -0.2], [0.06, 0.48, 0.2], material.equipment),
    box([-0.07, 0.87, -0.1], [0.28, 0.12, 0.2], material.equipment)
  ])
}

export function signalStudio(plot: ZonePlot): PartSpec[] {
  return fitParts(plot, [
    industrialPad(),
    ...industrialWing(box([-0.22, 0.42, -0.14], [0.3, 0.76, 0.56], material.facade)),
    ...industrialWing(box([0.17, 0.3, -0.04], [0.44, 0.52, 0.64], material.graphite)),
    lit(box([-0.22, 0.57, 0.16], [0.18, 0.36, 0.036], material.cyan)),
    box([0.17, 0.39, 0.29], [0.46, 0.025, 0.19], material.equipment),
    lit(box([0.17, 0.44, 0.355], [0.38, 0.07, 0.024], material.amber)),
    box([0.38, 0.39, -0.05], [0.06, 0.57, 0.56], material.equipment),
    box([-0.22, 0.91, -0.14], [0.16, 0.12, 0.16], material.equipment)
  ])
}
