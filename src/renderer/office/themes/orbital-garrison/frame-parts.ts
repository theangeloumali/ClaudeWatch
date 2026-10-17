import { FACADE_LAYER_STEP_M } from '../../scene/building-window-parts'
import type { Vector } from '../primitives'
import { box, turned, type PartSpec, lit, SIDES } from '../parts'
import { GARRISON } from './palette'
import type { FrameKind } from './roster'

interface FrameLivery {
  armor: string
  joint: string
  trim: string
}

const LIVERY: Record<FrameKind, FrameLivery> = {
  trooper: { armor: GARRISON.steel, joint: GARRISON.gunmetal, trim: GARRISON.white },
  heavy: { armor: GARRISON.navy, joint: GARRISON.gunmetal, trim: GARRISON.orange },
  scout: { armor: GARRISON.orange, joint: GARRISON.gunmetal, trim: GARRISON.white }
}

const ARM_X = 0.44
const rod = (at: Vector, size: Vector, color: string, rotation?: Vector): PartSpec => ({
  shape: 'cylinder',
  at,
  size,
  color,
  rotation
})

// The blocky mass-production chassis every frame shares, standing parked: feet at y 0, facing
// +z, about 2 m tall. Square shoulders, a flat head and one wide band visor.
function chassis({ armor, joint, trim }: FrameLivery): PartSpec[] {
  return [
    ...SIDES.flatMap((side): PartSpec[] => [
      box([side * 0.24, 0.07, 0.05], [0.26, 0.14, 0.42], joint),
      box([side * 0.24, 0.42, 0], [0.22, 0.56, 0.26], armor),
      box([side * 0.24, 0.72, 0.1], [0.2, 0.14, 0.12], trim),
      box([side * 0.2, 0.95, 0], [0.17, 0.36, 0.2], joint),
      box([side * ARM_X, 1.46, 0], [0.14, 0.3, 0.16], joint),
      box([side * ARM_X, 1.12, 0.02], [0.17, 0.36, 0.2], armor),
      box([side * ARM_X, 0.9, 0.02], [0.13, 0.1, 0.15], joint),
      { shape: 'cone', at: [side * 0.12, 1.32, -0.27], size: [0.13, 0.14, 0.13], color: joint }
    ]),
    box([0, 1.56, 0], [0.62, 0.38, 0.36], armor),
    ...SIDES.map((side) => box([side * 0.15, 1.6, 0.185], [0.18, 0.1, 0.03], joint)),
    ...SIDES.map((side) => box([side * ARM_X, 1.7, 0], [0.26, 0.2, 0.3], armor)),
    box([0, 1.87, 0.02], [0.24, 0.2, 0.26], armor),
    { ...box([0, 1.88, 0.155], [0.2, 0.045, 0.02], GARRISON.ice), glow: true },
    box([0, 1.16, 0], [0.56, 0.16, 0.28], armor),
    box([0, 1.1, 0.16], [0.2, 0.2, 0.05], trim),
    box([0, 1.3, 0], [0.24, 0.14, 0.2], joint),
    box([0, 1.48, 0.19], [0.2, 0.14, 0.04], trim),
    box([0, 1.56, -0.25], [0.4, 0.34, 0.16], joint)
  ]
}

const EXTRAS: Record<FrameKind, (livery: FrameLivery) => PartSpec[]> = {
  // A slab shield on the left forearm, a rifle slung on the pack and a comms mast.
  trooper: ({ trim }) => [
    box([-0.58, 1.15, 0.06], [0.05, 0.72, 0.42], trim),
    box([-0.612, 1.22, 0.06], [0.02, 0.12, 0.42 + 2 * FACADE_LAYER_STEP_M], GARRISON.orange),
    box([0.28, 1.55, -0.38], [0.09, 0.9, 0.11], GARRISON.hull),
    rod([-0.1, 2.1, -0.06], [0.025, 0.28, 0.025], trim)
  ],
  // Twin shoulder guns pointing forward, an ammunition drum and spades behind the feet.
  heavy: ({ trim }) => [
    ...SIDES.flatMap((side) => [
      rod([side * 0.25, 2.02, 0.22], [0.1, 0.95, 0.1], GARRISON.steel, [Math.PI / 2, 0, 0]),
      box([side * 0.25, 2.02, -0.16], [0.18, 0.18, 0.34], GARRISON.gunmetal),
      box([side * 0.24, 0.05, -0.24], [0.3, 0.1, 0.2], trim)
    ]),
    rod([0, 1.52, -0.42], [0.32, 0.46, 0.32], GARRISON.steel, [0, 0, Math.PI / 2]),
    box([0, 1.76, 0.185], [0.62, 0.04, 0.03], trim)
  ],
  // Swept thruster fins, a sensor dish on a mast and a low centre fin.
  scout: ({ trim }) => [
    ...SIDES.map((side) =>
      turned(box([side * 0.3, 1.78, -0.4], [0.06, 0.74, 0.26], trim), [0.5, 0, side * -0.3])
    ),
    rod([0, 2.02, -0.25], [0.03, 0.26, 0.03], GARRISON.steel),
    rod([0, 2.16, -0.25], [0.34, 0.03, 0.34], GARRISON.steel, [0.5, 0, 0]),
    box([0, 2, 0.02], [0.03, 0.07, 0.24], trim)
  ]
}

export function frameParts(kind: FrameKind): PartSpec[] {
  return [...chassis(LIVERY[kind]), ...EXTRAS[kind](LIVERY[kind])]
}

// The service gantry a frame is parked in: a plinth, two posts, a hazard beam and clamps.
export const GANTRY: PartSpec[] = [
  box([0, 0.03, 0], [1.05, 0.06, 0.85], GARRISON.gunmetal),
  box([0, 0.035, 0.4], [1.05, 0.07, 0.06], GARRISON.orange),
  ...SIDES.flatMap((side) => [
    box([side * 0.56, 0.95, -0.32], [0.07, 1.9, 0.07], GARRISON.steel),
    box([side * 0.42, 1.2, -0.32], [0.28, 0.05, 0.05], GARRISON.steel),
    lit(box([side * 0.56, 1.96, -0.32], [0.09, 0.07, 0.09], GARRISON.ice))
  ]),
  box([0, 1.88, -0.32], [1.26, 0.09, 0.11], GARRISON.orange)
]

// The commander's bridge: a railed dais, a helm and a lit tactical board.
export const BRIDGE: PartSpec[] = [
  box([0, 0.06, 0], [1.3, 0.12, 0.9], GARRISON.gunmetal),
  box([0, 0.065, 0.43], [1.3, 0.13, 0.05], GARRISON.orange),
  box([0, 1, -0.36], [1.2, 1.3, 0.07], GARRISON.hull),
  lit(box([0, 1.02, -0.32], [1.06, 0.94, 0.012], GARRISON.ice)),
  box([-0.2, 1.12, -0.31], [0.34, 0.24, 0.012], GARRISON.navy),
  box([0.26, 0.86, -0.31], [0.24, 0.34, 0.012], GARRISON.navy),
  box([0, 1.6, -0.34], [1.24, 0.08, 0.1], GARRISON.orange),
  box([0, 0.42, 0.1], [0.34, 0.6, 0.22], GARRISON.steel),
  box([0, 0.73, 0.1], [0.3, 0.02, 0.18], GARRISON.white),
  ...SIDES.map((side) => box([side * 0.6, 0.4, 0.38], [0.04, 0.56, 0.04], GARRISON.steel)),
  box([0, 0.68, 0.38], [1.24, 0.04, 0.04], GARRISON.steel)
]
