import type { ZonePlot, ZoneProp } from '../../town/town-dress'
import { box, cylinder, sphere, type PartSpec } from '../parts'
import { CORPORATE_MATERIALS as MATERIALS, CORPORATE_PALETTE as PALETTE } from './palette'

// dry-new: the existing themed garden props do not provide a contemporary street furniture kit.
export function plantedSquare(plot: ZonePlot): PartSpec[] {
  const { width, depth, height } = plot
  return [
    box([0, height * 0.02, 0], [width * 0.96, height * 0.04, depth * 0.96], MATERIALS.concrete),
    box(
      [0, height * 0.048, -depth * 0.1],
      [width * 0.82, height * 0.016, depth * 0.58],
      plot.accent
    ),
    box(
      [0, height * 0.06, depth * 0.25],
      [width * 0.84, height * 0.02, depth * 0.14],
      MATERIALS.facade
    ),
    ...[-1, 1].flatMap((side) => [
      cylinder(
        [side * width * 0.25, height * 0.25, -depth * 0.14],
        [width * 0.035, height * 0.4, depth * 0.035],
        PALETTE.wood
      ),
      sphere(
        [side * width * 0.25, height * 0.58, -depth * 0.14],
        [width * 0.28, height * 0.62, depth * 0.32],
        MATERIALS.foliage
      ),
      box(
        [side * width * 0.27, height * 0.055, depth * 0.35],
        [width * 0.04, height * 0.05, depth * 0.07],
        MATERIALS.frame
      ),
      box(
        [side * width * 0.27, height * 0.11, depth * 0.35],
        [width * 0.25, height * 0.08, depth * 0.09],
        MATERIALS.frame
      )
    ])
  ]
}

export function linearGarden(plot: ZonePlot): PartSpec[] {
  const { width, depth, height } = plot
  return [
    box([0, height * 0.02, 0], [width * 0.96, height * 0.04, depth * 0.96], MATERIALS.concrete),
    box([0, height * 0.05, 0], [width * 0.26, height * 0.02, depth * 0.88], MATERIALS.facade),
    ...[-1, 1].flatMap((side) => [
      box(
        [side * width * 0.3, height * 0.08, depth * 0.14],
        [width * 0.26, height * 0.08, depth * 0.48],
        plot.accent
      ),
      sphere(
        [side * width * 0.3, height * 0.24, depth * 0.14],
        [width * 0.22, height * 0.3, depth * 0.44],
        MATERIALS.foliage
      ),
      box(
        [side * width * 0.3, height * 0.315, -depth * 0.25],
        [width * 0.035, height * 0.55, depth * 0.035],
        MATERIALS.frame
      )
    ]),
    box(
      [0, height * 0.615, -depth * 0.25],
      [width * 0.72, height * 0.05, depth * 0.23],
      plot.accent
    )
  ]
}

const STREET_ZONES: ZoneProp['zones'] = [
  'civic',
  'market',
  'entertainment',
  'residential',
  'workshop',
  'park'
]

export const CORPORATE_PROPS: readonly ZoneProp[] = [
  {
    name: 'cantilever streetlight',
    zones: STREET_ZONES,
    size: [0.9, 2.8, 0.6],
    parts: [
      box([0, 0.05, -0.15], [0.32, 0.1, 0.28], MATERIALS.concrete),
      box([0, 1.325, -0.15], [0.09, 2.55, 0.09], MATERIALS.frame),
      box([0.18, 2.62, -0.15], [0.45, 0.08, 0.12], MATERIALS.frame),
      box([0.3, 2.68, -0.15], [0.25, 0.1, 0.26], MATERIALS.light)
    ]
  },
  {
    name: 'mineral timber bench',
    zones: ['civic', 'market', 'entertainment', 'residential', 'park'],
    size: [1.5, 0.8, 0.6],
    parts: [
      ...[-1, 1].map((side) => box([side * 0.57, 0.2, 0], [0.12, 0.4, 0.44], MATERIALS.frame)),
      box([0, 0.46, 0], [1.5, 0.12, 0.55], PALETTE.wood),
      box([0, 0.68, -0.22], [1.5, 0.24, 0.1], PALETTE.wood)
    ]
  },
  {
    name: 'three hoop bike rack',
    zones: ['civic', 'market', 'entertainment', 'workshop'],
    size: [1.3, 0.95, 0.5],
    parts: [-1, 0, 1].flatMap((bay) => [
      ...[-1, 1].map((side) =>
        box([bay * 0.45, 0.4, side * 0.18], [0.06, 0.8, 0.06], MATERIALS.frame)
      ),
      box([bay * 0.45, 0.8, 0], [0.06, 0.06, 0.42], MATERIALS.frame)
    ])
  },
  {
    name: 'square evergreen planter',
    zones: STREET_ZONES,
    size: [1.15, 1, 1.15],
    parts: [
      box([0, 0.2, 0], [1.1, 0.4, 1.1], MATERIALS.concrete),
      sphere([0, 0.55, 0], [0.95, 0.65, 0.95], MATERIALS.foliage)
    ]
  },
  {
    name: 'city canopy tree',
    zones: ['civic', 'entertainment', 'residential', 'park'],
    size: [1.6, 2.7, 1.6],
    parts: [
      cylinder([0, 0.8, 0], [0.17, 1.6, 0.17], PALETTE.wood),
      sphere([0, 1.9, 0], [1.6, 1.5, 1.6], MATERIALS.foliage)
    ]
  },
  {
    name: 'raised planting bed',
    zones: ['civic', 'residential', 'park'],
    size: [1.8, 0.55, 0.8],
    parts: [
      box([0, 0.16, 0], [1.8, 0.32, 0.8], MATERIALS.concrete),
      box([0, 0.34, 0], [1.68, 0.08, 0.68], MATERIALS.park),
      ...[-1, 1].map((side) => sphere([side * 0.46, 0.4, 0], [0.52, 0.28, 0.56], MATERIALS.foliage))
    ]
  },
  {
    name: 'pedestrian bollard',
    zones: STREET_ZONES,
    size: [0.35, 0.9, 0.35],
    parts: [
      box([0, 0.04, 0], [0.34, 0.08, 0.34], MATERIALS.concrete),
      cylinder([0, 0.43, 0], [0.16, 0.86, 0.16], MATERIALS.frame),
      box([0, 0.83, 0], [0.18, 0.08, 0.18], MATERIALS.light)
    ]
  },
  {
    name: 'avenue transit shelter',
    zones: ['civic', 'market', 'entertainment', 'residential'],
    size: [1.8, 2.2, 1.1],
    parts: [
      ...[-1, 1].map((side) => box([side * 0.78, 1, -0.38], [0.09, 2, 0.09], MATERIALS.frame)),
      box([0, 1, -0.42], [1.7, 1.8, 0.08], MATERIALS.glass),
      box([0, 1.99, 0], [1.8, 0.12, 1.1], MATERIALS.roof),
      box([0, 0.43, -0.15], [1.3, 0.1, 0.35], PALETTE.wood),
      box([0, 0.19, -0.15], [0.18, 0.38, 0.3], MATERIALS.frame)
    ]
  },
  {
    name: 'street recycling bin',
    zones: STREET_ZONES,
    size: [0.48, 0.78, 0.48],
    parts: [
      box([0, 0.34, 0], [0.44, 0.68, 0.44], MATERIALS.frame),
      box([0, 0.72, 0], [0.48, 0.07, 0.48], MATERIALS.concrete)
    ]
  }
]
