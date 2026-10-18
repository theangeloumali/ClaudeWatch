import {
  ball,
  box,
  tube,
  wheel,
  type CitizenFigure,
  type FigurePart
} from '../../citizens/figure-parts'
import type { VehicleDesign } from '../../town/town-dress'
import {
  CORPORATE_MATERIALS as MATERIALS,
  HUMAN_CLOTHING_COLORS,
  HUMAN_HAIR_COLORS,
  HUMAN_SKIN_TONES
} from './palette'

// dry-new: the shared person builder wears a robe; these adults have trousers and unbadged coats.
function adult(dress: Record<'coat' | 'trousers' | 'hair' | 'skin', string>): FigurePart[] {
  return [
    ...[-1, 1].flatMap((side) => [
      box(MATERIALS.shoe, [0.13, 0.09, 0.26], [side * 0.095, 0.045, 0.05]),
      box(dress.trousers, [0.12, 0.41, 0.14], [side * 0.095, 0.275, 0]),
      box(dress.coat, [0.1, 0.39, 0.17], [side * 0.25, 0.67, 0])
    ]),
    box(dress.coat, [0.39, 0.42, 0.21], [0, 0.68, 0]),
    ball(dress.skin, 0.12, [0, 1.025, 0]),
    tube(dress.hair, [0.1, 0.12, 0.055], [0, 1.125, -0.005]),
    box(dress.skin, [0.05, 0.065, 0.05], [0, 1.01, 0.125])
  ]
}

export const CORPORATE_CITIZENS: readonly CitizenFigure[] = [
  {
    name: 'city commuter',
    parts: () =>
      adult({
        coat: HUMAN_CLOTHING_COLORS[0],
        trousers: MATERIALS.frame,
        hair: HUMAN_HAIR_COLORS[1],
        skin: HUMAN_SKIN_TONES[3]
      })
  },
  {
    name: 'neighborhood reader',
    parts: () =>
      adult({
        coat: HUMAN_CLOTHING_COLORS[1],
        trousers: MATERIALS.roof,
        hair: HUMAN_HAIR_COLORS[3],
        skin: HUMAN_SKIN_TONES[1]
      })
  },
  {
    name: 'studio visitor',
    parts: () =>
      adult({
        coat: HUMAN_CLOTHING_COLORS[2],
        trousers: MATERIALS.frame,
        hair: HUMAN_HAIR_COLORS[0],
        skin: HUMAN_SKIN_TONES[5]
      })
  },
  {
    name: 'park neighbor',
    parts: () =>
      adult({
        coat: HUMAN_CLOTHING_COLORS[4],
        trousers: MATERIALS.roof,
        hair: HUMAN_HAIR_COLORS[2],
        skin: HUMAN_SKIN_TONES[0]
      })
  }
]

function transit(): FigurePart[] {
  return [
    box(MATERIALS.civic, [1.25, 0.9, 3.7], [0, 0.85, 0]),
    box(MATERIALS.glass, [1.24, 0.52, 3.3], [0, 1.42, 0]),
    box(MATERIALS.facade, [1.25, 0.1, 3.55], [0, 1.72, 0]),
    box(MATERIALS.light, [0.99, 0.09, 0.04], [0, 0.83, 1.87]),
    box(MATERIALS.frame, [1.05, 0.1, 0.04], [0, 0.48, 1.87]),
    ...[-1, 1].flatMap((side) => [
      ...[-1, 0, 1].map((axle) =>
        wheel(MATERIALS.frame, 0.27, 0.15, [side * 0.63, 0.27, axle * 1.25], 8)
      ),
      ...[-1, 1].map((bay) =>
        box(MATERIALS.frame, [0.025, 0.5, 0.055], [side * 0.63, 1.42, bay * 0.85])
      )
    ])
  ]
}

function freight(): FigurePart[] {
  return [
    box(MATERIALS.frame, [1.22, 0.18, 3.48], [0, 0.38, -0.02]),
    box(MATERIALS.workshop, [1.25, 0.93, 1.0], [0, 0.85, 1.09]),
    box(MATERIALS.glass, [1.22, 0.42, 0.82], [0, 1.35, 1.2]),
    box(MATERIALS.facade, [1.22, 1.16, 2.28], [0, 0.99, -0.65]),
    box(MATERIALS.roof, [1.25, 0.07, 2.28], [0, 1.61, -0.65]),
    box(MATERIALS.frame, [1.02, 0.98, 0.04], [0, 0.92, -1.8]),
    box(MATERIALS.light, [0.92, 0.1, 0.05], [0, 0.78, 1.62]),
    ...[-1, 1].flatMap((side) =>
      [-1, 1].map((axle) => wheel(MATERIALS.frame, 0.26, 0.16, [side * 0.62, 0.26, axle * 1.24], 8))
    )
  ]
}

function runabout(): FigurePart[] {
  return [
    box(MATERIALS.residential, [1.12, 0.5, 2.26], [0, 0.5, 0]),
    box(MATERIALS.glass, [1.02, 0.4, 1.22], [0, 0.9, -0.12]),
    box(MATERIALS.roof, [1.07, 0.09, 1.2], [0, 1.13, -0.12]),
    box(MATERIALS.light, [0.98, 0.08, 0.035], [0, 0.62, 1.15]),
    box(MATERIALS.frame, [1.12, 0.09, 0.12], [0, 0.35, 1.12]),
    ...[-1, 1].flatMap((side) =>
      [-1, 1].map((axle) => wheel(MATERIALS.frame, 0.23, 0.15, [side * 0.58, 0.23, axle * 0.78], 8))
    )
  ]
}

export const CORPORATE_VEHICLES: readonly VehicleDesign[] = [
  { name: 'avenue electric bus', role: 'transit', parts: transit },
  { name: 'district delivery van', role: 'freight', parts: freight },
  { name: 'compact city runabout', role: 'runabout', parts: runabout }
]
