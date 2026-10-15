import { DESK_REACH } from '../../logic/room-layout'
import { box, cylinder, lit, turned, type PartSpec } from '../parts'
import { WORKSTATIONS } from '../workstations'
import { SAMURAI_MATERIALS as material } from './palette'

const [screenX, screenY, screenZ] = WORKSTATIONS.samurai.screen

// dry-new: this desk has a separate live front plane; no baked terminal or progress display.
export const SAMURAI_DESK_PARTS: readonly PartSpec[] = [
  box([0, 0.62, DESK_REACH], [1.12, 0.052, 0.6], material.indigo),
  box([0, 0.583, DESK_REACH], [1.02, 0.018, 0.48], material.mineral),
  ...[-0.46, 0.46].flatMap((across) => [
    box([across, 0.293, DESK_REACH], [0.058, 0.586, 0.46], material.slate),
    box([across, 0.031, DESK_REACH], [0.17, 0.062, 0.52], material.charcoal)
  ]),
  box([screenX, screenY, screenZ + 0.028], [0.47, 0.27, 0.05], material.charcoal),
  box([0, 0.671, screenZ + 0.042], [0.22, 0.025, 0.14], material.metal),
  box([0, 0.722, screenZ + 0.042], [0.055, 0.095, 0.044], material.slate),
  ...[-1, 1].map((side) =>
    box([side * 0.248, screenY, screenZ + 0.017], [0.026, 0.304, 0.038], material.metal)
  ),
  ...[-1, 1].map((side) =>
    box([0, screenY + side * 0.145, screenZ + 0.017], [0.496, 0.02, 0.038], material.metal)
  ),
  box([0, 0.657, DESK_REACH - 0.135], [0.35, 0.021, 0.135], material.charcoal),
  ...Array.from({ length: 4 }, (_, row) =>
    box([0, 0.674, DESK_REACH - 0.181 + row * 0.028], [0.316, 0.012, 0.017], material.mineral)
  ),
  box([0, 0.674, DESK_REACH - 0.191], [0.114, 0.012, 0.017], material.slate),
  cylinder([0.285, 0.671, DESK_REACH - 0.115], [0.071, 0.028, 0.099], material.metal),
  box([0.285, 0.689, DESK_REACH - 0.115], [0.006, 0.008, 0.07], material.charcoal),
  box([0.405, 0.799, DESK_REACH + 0.078], [0.18, 0.305, 0.22], material.slate),
  box([0.405, 0.799, DESK_REACH - 0.039], [0.149, 0.279, 0.014], material.charcoal),
  ...Array.from({ length: 4 }, (_, vent) =>
    box([0.405, 0.71 + vent * 0.031, DESK_REACH - 0.048], [0.108, 0.01, 0.005], material.metal)
  ),
  lit(box([0.454, 0.901, DESK_REACH - 0.048], [0.012, 0.012, 0.006], material.cyan)),
  box([0, 0.44, -0.012], [0.43, 0.058, 0.42], material.indigo),
  box([0, 0.205, -0.012], [0.075, 0.41, 0.075], material.metal),
  box([0, 0.034, -0.012], [0.43, 0.068, 0.36], material.charcoal),
  turned(box([0, 0.655, -0.194], [0.43, 0.37, 0.063], material.slate), [-0.1, 0, 0])
]

export const SAMURAI_LOUNGE_SEAT: readonly PartSpec[] = [
  box([0, 0.42, 0], [0.5, 0.056, 0.45], material.indigo),
  box([0, 0.206, 0], [0.078, 0.412, 0.078], material.metal),
  box([0, 0.024, 0], [0.42, 0.048, 0.38], material.charcoal),
  turned(box([0, 0.644, -0.195], [0.5, 0.39, 0.07], material.slate), [-0.15, 0, 0])
]

export const SAMURAI_TEA_STATION: readonly PartSpec[] = [
  box([0, 0.28, 0], [0.5, 0.56, 0.38], material.indigo),
  box([0, 0.579, 0], [0.56, 0.038, 0.42], material.mineral),
  cylinder([-0.12, 0.67, 0], [0.14, 0.145, 0.14], material.metal),
  box([-0.028, 0.674, 0], [0.074, 0.038, 0.05], material.metal),
  cylinder([0.14, 0.634, 0.06], [0.079, 0.073, 0.079], material.mineral),
  lit(box([0.17, 0.31, 0.199], [0.023, 0.11, 0.016], material.amber))
]
