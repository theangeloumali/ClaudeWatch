import type { ZoneProp } from '../../town/town-dress'
import { box, cylinder, lit, sphere } from '../parts'
import { SAMURAI_MATERIALS as material } from './palette'

const ALL_DISTRICTS = [
  'civic',
  'market',
  'entertainment',
  'residential',
  'workshop',
  'park'
] as const

export const SAMURAI_PROPS: readonly ZoneProp[] = [
  {
    name: 'amber blade lantern',
    zones: ALL_DISTRICTS,
    size: [0.95, 1.8, 0.5],
    parts: [
      box([0, 0.035, 0], [0.35, 0.07, 0.35], material.mineral),
      box([0, 0.87, 0], [0.055, 1.67, 0.055], material.slate),
      box([0.17, 1.73, 0], [0.57, 0.08, 0.27], material.indigo),
      lit(box([0.29, 1.58, 0], [0.16, 0.22, 0.16], material.amber)),
      box([0.29, 1.43, 0], [0.21, 0.035, 0.21], material.metal)
    ]
  },
  {
    name: 'mineral rest bench',
    zones: ALL_DISTRICTS,
    size: [1.2, 0.55, 0.5],
    parts: [
      box([0, 0.37, 0], [1.2, 0.075, 0.46], material.mineral),
      ...[-0.43, 0.43].map((across) =>
        box([across, 0.166, 0], [0.095, 0.332, 0.35], material.slate)
      ),
      box([0, 0.49, -0.21], [1.2, 0.12, 0.04], material.indigo)
    ]
  },
  {
    name: 'cloud pine planter',
    zones: ['park', 'residential', 'civic'],
    size: [1.1, 1.75, 1.1],
    parts: [
      box([0, 0.12, 0], [0.57, 0.24, 0.57], material.indigo),
      cylinder([0, 0.7, 0], [0.09, 1.02, 0.09], material.slate),
      sphere([-0.13, 1.39, 0], [0.83, 0.55, 0.83], material.moss),
      sphere([0.21, 1.14, 0.11], [0.62, 0.42, 0.64], material.moss)
    ]
  },
  {
    name: 'canal corner basin',
    zones: ['park', 'civic', 'residential'],
    size: [0.9, 0.32, 0.75],
    parts: [
      box([0, 0.13, 0], [0.88, 0.26, 0.73], material.mineral),
      box([0, 0.263, 0], [0.71, 0.018, 0.55], material.canal),
      box([0.26, 0.27, 0.15], [0.19, 0.1, 0.18], material.moss)
    ]
  },
  {
    name: 'signal relay pedestal',
    zones: ['civic', 'workshop', 'market'],
    size: [0.65, 1.3, 0.5],
    parts: [
      box([0, 0.035, 0], [0.62, 0.07, 0.48], material.mineral),
      box([0, 0.56, 0], [0.39, 1.05, 0.28], material.slate),
      ...[-0.12, 0.12].map((across) =>
        lit(box([across, 0.62, 0.15], [0.027, 0.72, 0.022], material.cyan))
      ),
      box([0, 1.185, 0], [0.054, 0.23, 0.054], material.metal)
    ]
  },
  {
    name: 'arcade repair crates',
    zones: ['workshop', 'market', 'entertainment'],
    size: [0.9, 0.55, 0.7],
    parts: [
      box([-0.19, 0.17, 0], [0.45, 0.34, 0.53], material.indigo),
      box([0.28, 0.14, 0.08], [0.29, 0.28, 0.47], material.slate),
      box([-0.19, 0.442, 0], [0.29, 0.205, 0.36], material.mineral),
      box([-0.19, 0.16, 0.275], [0.29, 0.034, 0.014], material.magenta)
    ]
  }
]
