import { DESK_REACH } from '../../logic/room-layout'
import { box, cylinder, type PartSpec } from '../parts'
import { WORKSTATIONS } from '../workstations'
import { CYBERPUNK_PALETTE as palette } from './palette'

const [screenX, screenY, screenZ] = WORKSTATIONS.corporate.screen

// dry-new: industrial desks keep the shared live screen plane with substantially fewer parts.
export const CYBERPUNK_SEAT: readonly PartSpec[] = [
  cylinder([0, 0.167, 0], [0.065, 0.27, 0.065], palette.brass),
  box([0, 0.036, 0], [0.42, 0.05, 0.065], palette.ink),
  box([0, 0.036, 0], [0.065, 0.05, 0.42], palette.ink),
  box([0, 0.325, 0], [0.43, 0.065, 0.4], palette.lacquer),
  box([0, 0.525, -0.205], [0.38, 0.32, 0.075], palette.lacquer)
]

export const CYBERPUNK_DESK: readonly PartSpec[] = [
  box([0, 0.54, DESK_REACH], [1.18, 0.06, 0.6], palette.brass),
  box([0, 0.575, DESK_REACH], [1.12, 0.01, 0.55], palette.wood),
  ...[-0.48, 0.48].map((across) =>
    box([across, 0.27, DESK_REACH], [0.055, 0.48, 0.46], palette.ink)
  ),
  box([screenX, screenY, screenZ + 0.027], [0.47, 0.29, 0.044], palette.ink),
  box([0, 0.65, screenZ + 0.035], [0.04, 0.17, 0.04], palette.brass),
  box([0, 0.583, screenZ + 0.035], [0.2, 0.014, 0.12], palette.ink),
  ...[-1, 1].flatMap((side) => [
    box([side * 0.223, screenY, screenZ + 0.01], [0.014, 0.27, 0.015], palette.brass),
    box([0, screenY + side * 0.133, screenZ + 0.01], [0.45, 0.016, 0.015], palette.brass)
  ]),
  box([0, 0.588, DESK_REACH - 0.14], [0.35, 0.018, 0.14], palette.ink),
  ...[0, 1, 2, 3].map((row) =>
    box([0, 0.601, DESK_REACH - 0.185 + row * 0.026], [0.31, 0.008, 0.012], palette.brass)
  ),
  box([0.3, 0.597, DESK_REACH - 0.13], [0.063, 0.026, 0.088], palette.ink),
  box([0.36, 0.28, DESK_REACH + 0.1], [0.2, 0.46, 0.25], palette.ink),
  box([0.36, 0.28, DESK_REACH - 0.029], [0.16, 0.39, 0.008], palette.brass),
  ...[0, 1, 2].map((vent) =>
    box([0.36, 0.13 + vent * 0.038, DESK_REACH - 0.036], [0.11, 0.012, 0.008], palette.ink)
  ),
  ...CYBERPUNK_SEAT
]

export const CYBERPUNK_ENTRY: readonly PartSpec[] = [
  ...[-3.55, 3.55].map((across) => box([across, 1.8, 0], [0.18, 3.6, 0.32], palette.brass)),
  box([0, 3.6, 0], [7.28, 1.12, 0.16], palette.ink),
  box([3.55, 1.16, 0.18], [0.07, 0.19, 0.04], palette.glow)
]
export const CYBERPUNK_LIFT: readonly PartSpec[] = [
  box([0, 0.04, 0], [1.8, 0.08, 1.8], palette.brass),
  ...[-0.8, 0.8].map((across) => box([across, 0.66, 0], [0.12, 1.24, 1.5], palette.ink)),
  box([0, 0.65, -0.73], [1.48, 1.24, 0.06], palette.brass),
  box([0, 1.34, 0], [1.85, 0.12, 1.65], palette.ink),
  box([0, 1.275, 0.62], [1.3, 0.02, 0.06], palette.paper)
]
