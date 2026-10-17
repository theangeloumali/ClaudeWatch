import type { ZonePlot } from '../../town/town-dress'
import { box, type PartSpec } from '../parts'
import { CORPORATE_MATERIALS as MATERIALS } from './palette'
import { fitParts, plaza, roofService, wing } from './building-parts'

export function serviceHall(plot: ZonePlot): PartSpec[] {
  return fitParts(plot, [
    ...plaza(),
    ...wing(box([0, 0.41, -0.13], [0.82, 0.74, 0.58], plot.accent), plot),
    box([0, 0.28, 0.23], [0.4, 0.035, 0.23], MATERIALS.frame),
    ...roofService(plot, 0.78)
  ])
}

export function courtyardServices(plot: ZonePlot): PartSpec[] {
  return fitParts(plot, [
    ...plaza(),
    ...[-1, 1].flatMap((side) =>
      wing(box([side * 0.25, 0.38, -0.06], [0.3, 0.68, 0.7], plot.accent), plot)
    ),
    box([0, 0.21, -0.34], [0.24, 0.34, 0.16], MATERIALS.glass),
    box([0, 0.4, -0.34], [0.26, 0.035, 0.18], plot.accent)
  ])
}

export function cornerCafe(plot: ZonePlot): PartSpec[] {
  return fitParts(plot, [
    ...plaza(),
    ...wing(box([-0.14, 0.38, -0.07], [0.58, 0.68, 0.68], plot.accent), plot),
    ...wing(box([0.28, 0.24, -0.02], [0.22, 0.4, 0.48], plot.accent), plot),
    box([-0.14, 0.51, 0.31], [0.62, 0.035, 0.18], MATERIALS.frame),
    box([-0.12, 0.18, 0.35], [0.24, 0.035, 0.08], MATERIALS.retail)
  ])
}

export function retailArcade(plot: ZonePlot): PartSpec[] {
  return fitParts(plot, [
    ...plaza(),
    ...[-1, 0, 1].flatMap((bay) =>
      wing(
        box(
          [bay * 0.29, 0.3 + (bay === 0 ? 0.1 : 0), -0.08],
          [0.27, bay === 0 ? 0.72 : 0.52, 0.62],
          plot.accent
        ),
        plot
      )
    ),
    box([0, 0.29, 0.3], [0.9, 0.035, 0.19], MATERIALS.frame)
  ])
}

export function artGallery(plot: ZonePlot): PartSpec[] {
  return fitParts(plot, [
    ...plaza(),
    ...wing(box([-0.15, 0.42, -0.06], [0.54, 0.76, 0.72], plot.accent), plot),
    ...wing(box([0.27, 0.285, 0.02], [0.26, 0.49, 0.54], plot.accent), plot),
    box([-0.31, 0.49, 0.315], [0.12, 0.43, 0.035], plot.accent),
    box([0.18, 0.15, 0.34], [0.06, 0.22, 0.06], MATERIALS.frame)
  ])
}

export function communityHall(plot: ZonePlot): PartSpec[] {
  return fitParts(plot, [
    ...plaza(),
    ...wing(box([0, 0.38, -0.06], [0.8, 0.68, 0.66], plot.accent), plot),
    box([-0.2, 0.81, -0.08], [0.28, 0.18, 0.45], MATERIALS.facade),
    box([-0.2, 0.915, -0.08], [0.3, 0.03, 0.47], plot.accent),
    box([0.14, 0.34, 0.33], [0.45, 0.025, 0.18], MATERIALS.frame)
  ])
}

export function apartmentSlab(plot: ZonePlot): PartSpec[] {
  return fitParts(plot, [
    ...plaza(),
    ...wing(box([0, 0.435, -0.08], [0.84, 0.79, 0.66], plot.accent), plot),
    ...[0.25, 0.48, 0.7].map((level) =>
      box([0, level, 0.3], [0.76, 0.03, 0.12], MATERIALS.concrete)
    ),
    box([-0.38, 0.43, -0.08], [0.07, 0.76, 0.67], MATERIALS.frame),
    ...roofService(plot, 0.83)
  ])
}

export function steppedApartments(plot: ZonePlot): PartSpec[] {
  return fitParts(plot, [
    ...plaza(),
    ...[-1, 0, 1].flatMap((bay) => {
      const height = 0.65 - bay * 0.16
      return wing(
        box([bay * 0.29, 0.04 + height / 2, -0.08], [0.27, height, 0.66], plot.accent),
        plot
      )
    }),
    box([0.29, 0.565, -0.08], [0.19, 0.045, 0.43], MATERIALS.foliage)
  ])
}

export function serviceStudio(plot: ZonePlot): PartSpec[] {
  return fitParts(plot, [
    ...plaza(),
    ...wing(box([-0.18, 0.38, -0.05], [0.52, 0.68, 0.7], plot.accent), plot),
    ...wing(box([0.27, 0.25, 0.02], [0.26, 0.42, 0.48], plot.accent), plot),
    box([-0.18, 0.24, 0.315], [0.29, 0.36, 0.025], MATERIALS.frame),
    box([-0.18, 0.48, 0.34], [0.4, 0.025, 0.13], MATERIALS.roof)
  ])
}

export function serviceCourt(plot: ZonePlot): PartSpec[] {
  return fitParts(plot, [
    ...plaza(),
    ...[-1, 1].flatMap((side) =>
      wing(box([side * 0.29, 0.305, -0.07], [0.27, 0.53, 0.68], plot.accent), plot)
    ),
    ...wing(box([0, 0.39, -0.28], [0.28, 0.7, 0.22], plot.accent), plot),
    box([0, 0.06, 0.12], [0.22, 0.04, 0.42], MATERIALS.frame)
  ])
}

export function headquarters(plot: ZonePlot): PartSpec[] {
  return fitParts(plot, [
    ...plaza(),
    box([0, 0.12, -0.05], [0.84, 0.16, 0.72], MATERIALS.frame),
    ...wing(box([-0.09, 0.51, -0.11], [0.5, 0.74, 0.62], plot.accent), plot),
    ...wing(box([0.29, 0.365, -0.11], [0.22, 0.45, 0.5], plot.accent), plot),
    box([-0.37, 0.53, -0.13], [0.1, 0.82, 0.55], MATERIALS.frame),
    box([-0.37, 0.95, -0.13], [0.12, 0.02, 0.57], plot.accent),
    box([0, 0.215, 0.29], [0.52, 0.035, 0.22], MATERIALS.facade),
    ...roofService(plot, 0.88)
  ])
}

export function cultureCentre(plot: ZonePlot): PartSpec[] {
  return fitParts(plot, [
    ...plaza(),
    ...wing(box([0, 0.405, -0.2], [0.74, 0.73, 0.48], plot.accent), plot),
    ...wing(box([0, 0.21, 0.17], [0.7, 0.34, 0.25], plot.accent), plot),
    box([0, 0.43, 0.22], [0.9, 0.045, 0.38], MATERIALS.facade),
    box([0.22, 0.85, -0.2], [0.2, 0.22, 0.34], MATERIALS.frame),
    box([0.22, 0.974, -0.2], [0.22, 0.025, 0.36], plot.accent)
  ])
}

export function innovationHub(plot: ZonePlot): PartSpec[] {
  return fitParts(plot, [
    ...plaza(),
    ...wing(box([-0.22, 0.47, -0.08], [0.34, 0.86, 0.66], plot.accent), plot),
    ...wing(box([0.18, 0.31, -0.22], [0.42, 0.54, 0.38], plot.accent), plot),
    box([0.18, 0.23, -0.01], [0.24, 0.32, 0.025], MATERIALS.frame),
    box([0.18, 0.1, 0.16], [0.3, 0.04, 0.32], MATERIALS.roof)
  ])
}
