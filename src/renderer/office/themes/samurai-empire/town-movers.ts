import { box, wheel, type CitizenFigure } from '../../citizens/figure-parts'
import type { VehicleDesign } from '../../town/town-dress'
import { selectSamuraiAppearance } from './armor'
import { samuraiFigureParts } from './figure-geometry'
import { SAMURAI_MATERIALS as material } from './palette'

// dry-new: these decorative townspeople use the same adult anatomy without becoming workers.
export const SAMURAI_CITIZENS: readonly CitizenFigure[] = [
  { name: 'canal ronin', parts: () => samuraiFigureParts(selectSamuraiAppearance('canal-ronin')) },
  {
    name: 'network guard',
    parts: () =>
      samuraiFigureParts({
        ...selectSamuraiAppearance('network-guard'),
        armor: material.charcoal,
        signal: material.amber
      })
  },
  {
    name: 'repair courier',
    parts: () => [
      ...samuraiFigureParts({
        ...selectSamuraiAppearance('repair-courier'),
        armor: material.slate
      }),
      box(material.magenta, [0.18, 0.22, 0.08], [0.12, 0.73, -0.125]),
      box(material.mineral, [0.13, 0.018, 0.014], [0.12, 0.78, -0.17])
    ]
  },
  {
    name: 'arcade artisan',
    parts: () => [
      ...samuraiFigureParts({
        ...selectSamuraiAppearance('arcade-artisan'),
        armor: material.indigo,
        signal: material.cyan
      }),
      box(material.amber, [0.15, 0.13, 0.065], [-0.15, 0.41, 0.075])
    ]
  }
]

function transitParts() {
  return [
    box(material.charcoal, [0.65, 0.22, 1.68], [0, 0.25, 0]),
    box(material.indigo, [0.61, 0.48, 1.49], [0, 0.6, -0.025]),
    box(material.mineral, [0.7, 0.06, 1.64], [0, 0.87, -0.025]),
    box(material.canal, [0.48, 0.24, 0.028], [0, 0.63, 0.734]),
    ...[-1, 1].flatMap((side) => [
      box(material.canal, [0.022, 0.24, 1.09], [side * 0.314, 0.64, -0.06]),
      box(material.cyan, [0.02, 0.034, 1.4], [side * 0.325, 0.41, 0]),
      ...[-0.54, 0.54].map((along) =>
        wheel(material.charcoal, 0.16, 0.075, [side * 0.31, 0.16, along])
      ),
      box(material.amber, [0.1, 0.055, 0.025], [side * 0.19, 0.35, 0.855])
    ]),
    box(material.metal, [0.028, 0.48, 0.02], [0.32, 0.6, 0.25])
  ]
}

function freightParts() {
  return [
    box(material.charcoal, [0.7, 0.13, 1.24], [0, 0.245, 0]),
    box(material.slate, [0.61, 0.47, 0.42], [0, 0.535, 0.39]),
    box(material.canal, [0.48, 0.24, 0.022], [0, 0.58, 0.61]),
    box(material.mineral, [0.64, 0.055, 0.46], [0, 0.797, 0.39]),
    box(material.indigo, [0.57, 0.31, 0.72], [0, 0.445, -0.19]),
    ...[-1, 1].flatMap((side) => [
      ...[-0.38, 0.4].map((along) =>
        wheel(material.charcoal, 0.18, 0.09, [side * 0.31, 0.18, along])
      ),
      box(material.metal, [0.025, 0.34, 0.7], [side * 0.3, 0.45, -0.19]),
      box(material.amber, [0.12, 0.045, 0.024], [side * 0.19, 0.37, 0.637])
    ]),
    box(material.magenta, [0.43, 0.028, 0.023], [0, 0.56, -0.56])
  ]
}

function runaboutParts() {
  return [
    box(material.indigo, [0.19, 0.15, 0.66], [0, 0.28, 0]),
    box(material.mineral, [0.21, 0.047, 0.28], [0, 0.38, -0.1]),
    ...[-0.27, 0.3].map((along) => wheel(material.charcoal, 0.155, 0.06, [0, 0.155, along])),
    box(material.metal, [0.025, 0.34, 0.04], [0, 0.48, 0.2]),
    box(material.charcoal, [0.35, 0.034, 0.04], [0, 0.65, 0.2]),
    box(material.cyan, [0.09, 0.05, 0.032], [0, 0.39, 0.34]),
    box(material.slate, [0.31, 0.22, 0.24], [0, 0.45, -0.28]),
    box(material.magenta, [0.25, 0.021, 0.025], [0, 0.5, -0.407])
  ]
}

export const SAMURAI_VEHICLES: readonly VehicleDesign[] = [
  { name: 'canal loop shuttle', role: 'transit', parts: transitParts },
  { name: 'arcade repair hauler', role: 'freight', parts: freightParts },
  { name: 'signal cargo cycle', role: 'runabout', parts: runaboutParts }
]
