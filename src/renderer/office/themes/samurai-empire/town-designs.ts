import type { ZoneDesign, ZonePlot } from '../../town/town-dress'
import { box, cylinder, lit, sphere, type PartSpec } from '../parts'
import { SAMURAI_MATERIALS as material } from './palette'

// dry-new: normalized original districts fit the shared lot contract without height-driven detail.
function fit(parts: readonly PartSpec[], plot: ZonePlot): PartSpec[] {
  return parts.map((part) => ({
    ...part,
    at: [part.at[0] * plot.width, part.at[1] * plot.height, part.at[2] * plot.depth],
    size: [part.size[0] * plot.width, part.size[1] * plot.height, part.size[2] * plot.depth]
  }))
}

function terracedDataKeep(plot: ZonePlot): PartSpec[] {
  const parts: PartSpec[] = [box([0, 0.025, 0], [0.96, 0.05, 0.96], material.mineral)]
  for (let tier = 0; tier < 4; tier++) {
    const width = 0.82 - tier * 0.135
    const height = 0.17 + tier * 0.22
    parts.push(
      box([0, height, -0.025], [width, 0.2, width], material.slate),
      box([0, height + 0.108, -0.025], [width + 0.1, 0.025, width + 0.1], material.indigo),
      box([0, height + 0.13, -0.025], [width + 0.075, 0.017, width + 0.075], material.mineral),
      lit(box([0, height, width / 2 - 0.019], [width * 0.72, 0.035, 0.015], plot.accent)),
      ...[-1, 1].map((side) =>
        box(
          [side * width * 0.32, height, width / 2 - 0.006],
          [0.035, 0.16, 0.025],
          material.charcoal
        )
      )
    )
  }
  parts.push(box([0, 0.955, -0.025], [0.032, 0.09, 0.032], material.metal))
  return fit(parts, plot)
}

function repairArcade(plot: ZonePlot): PartSpec[] {
  return fit(
    [
      box([0, 0.035, 0], [0.98, 0.07, 0.94], material.mineral),
      box([0, 0.44, -0.28], [0.88, 0.74, 0.34], material.slate),
      ...[-1, 0, 1].flatMap((bay) => [
        box([bay * 0.29, 0.28, -0.03], [0.22, 0.13, 0.21], material.indigo),
        box([bay * 0.29, 0.53, -0.06], [0.2, 0.035, 0.15], material.metal),
        box([bay * 0.29, 0.52, 0.27], [0.028, 0.9, 0.04], material.charcoal),
        lit(
          box(
            [bay * 0.29, 0.71, 0.16],
            [0.13, 0.09, 0.055],
            bay === 0 ? material.magenta : material.cyan
          )
        )
      ]),
      box([0, 0.96, 0.035], [0.98, 0.08, 0.76], material.indigo),
      box([0, 0.9, 0.3], [0.98, 0.025, 0.1], material.mineral),
      box([0.29, 0.2, 0.03], [0.12, 0.1, 0.14], material.metal)
    ],
    plot
  )
}

function networkGate(plot: ZonePlot): PartSpec[] {
  return fit(
    [
      box([0, 0.025, 0], [0.98, 0.05, 0.98], material.mineral),
      ...[-1, 1].flatMap((side) => [
        box([side * 0.33, 0.41, 0], [0.16, 0.72, 0.36], material.slate),
        box([side * 0.33, 0.105, 0], [0.27, 0.11, 0.52], material.charcoal),
        box([side * 0.22, 0.8, -0.04], [0.53, 0.08, 0.54], material.indigo),
        box([side * 0.25, 0.9, -0.055], [0.49, 0.055, 0.49], material.mineral),
        lit(box([side * 0.33, 0.45, 0.19], [0.037, 0.48, 0.025], material.cyan)),
        lit(box([side * 0.19, 0.37, 0.2], [0.06, 0.1, 0.065], material.amber))
      ]),
      cylinder([0, 0.073, -0.25], [0.2, 0.095, 0.2], material.metal),
      box([0, 0.965, -0.04], [0.05, 0.07, 0.08], material.magenta)
    ],
    plot
  )
}

function canalCourtyard(plot: ZonePlot): PartSpec[] {
  return fit(
    [
      box([0, 0.02, 0], [0.98, 0.04, 0.98], material.mineral),
      box([0, 0.05, 0], [0.3, 0.018, 0.92], material.canal),
      ...[-1, 1].flatMap((side) => [
        box([side * 0.34, 0.31, -0.13], [0.25, 0.54, 0.64], material.slate),
        box([side * 0.34, 0.61, -0.13], [0.29, 0.06, 0.69], material.indigo),
        box([side * 0.34, 0.73, -0.22], [0.2, 0.18, 0.39], material.mineral),
        lit(box([side * 0.34, 0.38, 0.2], [0.1, 0.07, 0.025], material.amber)),
        box([side * 0.26, 0.14, 0.36], [0.26, 0.2, 0.16], material.indigo)
      ]),
      box([0, 0.155, 0.19], [0.6, 0.035, 0.18], material.mineral),
      box([0, 0.23, 0.275], [0.6, 0.018, 0.018], material.metal),
      box([0.34, 0.91, -0.22], [0.024, 0.18, 0.024], material.cyan)
    ],
    plot
  )
}

function elevatedWalkway(plot: ZonePlot): PartSpec[] {
  return fit(
    [
      box([0, 0.025, 0], [0.98, 0.05, 0.94], material.mineral),
      ...[-1, 1].flatMap((side) => [
        box([side * 0.33, 0.46, -0.14], [0.25, 0.82, 0.53], material.slate),
        box([side * 0.33, 0.92, -0.14], [0.3, 0.065, 0.57], material.indigo),
        lit(box([side * 0.33, 0.64, 0.14], [0.14, 0.22, 0.024], plot.accent)),
        box([side * 0.31, 0.265, 0.3], [0.035, 0.43, 0.04], material.charcoal)
      ]),
      box([0, 0.485, 0.21], [0.9, 0.06, 0.24], material.indigo),
      box([0, 0.61, 0.32], [0.9, 0.022, 0.025], material.mineral),
      ...[-0.2, 0.2].map((across) => box([across, 0.55, 0.32], [0.02, 0.13, 0.02], material.metal)),
      box([0, 0.725, -0.23], [0.65, 0.045, 0.14], material.mineral)
    ],
    plot
  )
}

function mineralGarden(plot: ZonePlot): PartSpec[] {
  return fit(
    [
      box([0, 0.025, 0], [0.98, 0.05, 0.96], material.mineral),
      box([0, 0.07, -0.07], [0.82, 0.04, 0.7], material.moss),
      box([0, 0.095, 0.13], [0.58, 0.015, 0.11], material.canal),
      cylinder([-0.2, 0.43, -0.19], [0.045, 0.69, 0.045], material.slate),
      sphere([-0.2, 0.78, -0.19], [0.37, 0.34, 0.4], material.moss),
      sphere([-0.07, 0.68, -0.14], [0.29, 0.24, 0.3], material.moss),
      box([0.23, 0.16, 0.29], [0.35, 0.08, 0.14], material.indigo),
      box([0.23, 0.092, 0.29], [0.24, 0.055, 0.1], material.slate)
    ],
    plot
  )
}

export const SAMURAI_DESIGNS: readonly ZoneDesign[] = [
  {
    name: 'terraced data keep',
    zones: ['civic', 'residential'],
    height: { min: 1.8, max: 8 },
    build: terracedDataKeep
  },
  {
    name: 'repair market arcade',
    zones: ['market', 'workshop'],
    height: { min: 0.9, max: 2.4 },
    build: repairArcade
  },
  {
    name: 'network shrine gate',
    zones: ['civic', 'park'],
    height: { min: 1.1, max: 2.8 },
    build: networkGate
  },
  {
    name: 'canal courtyard',
    zones: ['residential', 'park'],
    height: { min: 0.9, max: 3 },
    build: canalCourtyard
  },
  {
    name: 'elevated walkway district',
    zones: ['entertainment', 'market'],
    height: { min: 1.6, max: 4 },
    build: elevatedWalkway
  },
  {
    name: 'mineral canal garden',
    zones: ['park'],
    height: { min: 0.6, max: 1.8 },
    build: mineralGarden
  },
  {
    name: 'signal citadel',
    zones: ['civic'],
    height: { min: 2.5, max: 10 },
    isLandmark: true,
    build: terracedDataKeep
  }
]
