import { DESK_REACH } from '../../logic/room-layout'
import { box, cylinder, turned, type PartSpec } from '../parts'
import { WORKSTATIONS } from '../workstations'
import { CORPORATE_MATERIALS as materials, CORPORATE_PALETTE as palette } from './palette'

// dry-new: fantasy stools and bulky terminals do not fit the contemporary chair/monitor brief.
const TASK_CHAIR_PARTS: readonly PartSpec[] = [
  cylinder([0, 0.1775, 0], [0.055, 0.275, 0.055], materials.frame),
  box([0, 0.06, 0], [0.36, 0.04, 0.055], materials.frame),
  box([0, 0.06, 0], [0.055, 0.04, 0.36], materials.frame),
  ...[-1, 1].flatMap((side) => [
    cylinder([side * 0.16, 0.035, 0], [0.07, 0.07, 0.07], materials.keyboard),
    cylinder([0, 0.035, side * 0.16], [0.07, 0.07, 0.07], materials.keyboard)
  ]),
  box([0, 0.325, 0], [0.42, 0.06, 0.4], palette.lacquer),
  box([0, 0.515, -0.205], [0.36, 0.3, 0.08], palette.lacquer),
  box([0, 0.435, -0.205], [0.04, 0.3, 0.045], materials.frame)
]

const SCREEN = WORKSTATIONS.corporate
const [SCREEN_ACROSS, SCREEN_HEIGHT, SCREEN_ALONG] = SCREEN.screen
const KEYBOARD_ALONG = DESK_REACH - 0.16
const TOWER_ACROSS = 0.35
const TOWER_ALONG = DESK_REACH + 0.07
const FACE_GAP = 0.004
const QUARTER_TURN = Math.PI / 2

const MONITOR_PARTS: readonly PartSpec[] = [
  // The live plane owns content; the opaque backing is recessed to avoid z-fighting.
  box(
    [SCREEN_ACROSS, SCREEN_HEIGHT, SCREEN_ALONG + FACE_GAP + 0.003],
    [SCREEN.width, SCREEN.height, 0.006],
    materials.screen
  ),
  ...[-1, 1].flatMap((side) => [
    box(
      [SCREEN_ACROSS + side * (SCREEN.width / 2 + 0.008), SCREEN_HEIGHT, SCREEN_ALONG + 0.014],
      [0.016, SCREEN.height + 0.032, 0.02],
      materials.frame
    ),
    box(
      [SCREEN_ACROSS, SCREEN_HEIGHT + side * (SCREEN.height / 2 + 0.008), SCREEN_ALONG + 0.014],
      [SCREEN.width + 0.032, 0.016, 0.02],
      materials.frame
    )
  ]),
  box([0, SCREEN_HEIGHT, SCREEN_ALONG + 0.041], [0.45, 0.27, 0.04], materials.keyboard),
  box([0, SCREEN_HEIGHT - 0.025, SCREEN_ALONG + 0.072], [0.09, 0.09, 0.022], materials.frame),
  ...[-3, -2, -1, 0, 1, 2, 3].map((vent) =>
    box(
      [vent * 0.041, SCREEN_HEIGHT + 0.035, SCREEN_ALONG + 0.063],
      [0.009, 0.05, 0.004],
      materials.frame
    )
  ),
  cylinder([0, 0.65, SCREEN_ALONG + 0.057], [0.032, 0.16, 0.032], materials.frame),
  box([0, 0.578, SCREEN_ALONG + 0.057], [0.22, 0.016, 0.125], materials.frame),
  box(
    [0.19, SCREEN_HEIGHT - SCREEN.height / 2 - 0.009, SCREEN_ALONG + 0.007],
    [0.012, 0.004, 0.004],
    materials.concrete
  )
]

const KEYBOARD_PARTS: readonly PartSpec[] = [
  box([0, 0.58, KEYBOARD_ALONG], [0.36, 0.02, 0.14], materials.keyboard),
  ...[0.425, 0.446, 0.467, 0.488].flatMap((along, row) =>
    Array.from({ length: 11 }, (_, column) =>
      box(
        [-0.149 + column * 0.022 + (row % 2) * 0.003, 0.593, along],
        [0.017, 0.006, 0.015],
        materials.concrete
      )
    )
  ),
  ...Array.from({ length: 9 }, (_, column) =>
    box([-0.147 + column * 0.028, 0.593, 0.516], [0.018, 0.006, 0.009], materials.frame)
  ),
  ...[0.128, 0.151].flatMap((across) =>
    [0.428, 0.449, 0.47].map((along) =>
      box([across, 0.593, along], [0.015, 0.006, 0.015], materials.concrete)
    )
  ),
  box([-0.033, 0.593, 0.404], [0.12, 0.006, 0.016], materials.concrete),
  ...[-0.145, 0.074, 0.128, 0.151].map((across) =>
    box([across, 0.593, 0.404], [0.022, 0.006, 0.016], materials.concrete)
  )
]

const MOUSE_PARTS: readonly PartSpec[] = [
  ...[-0.021, 0.021].map((offset) =>
    cylinder([0.32, 0.58, KEYBOARD_ALONG + offset], [0.064, 0.02, 0.064], materials.keyboard)
  ),
  box([0.32, 0.58, KEYBOARD_ALONG], [0.064, 0.02, 0.042], materials.keyboard),
  ...[-1, 1].map((side) =>
    box(
      [0.32 + side * 0.017, 0.593, KEYBOARD_ALONG - 0.022],
      [0.026, 0.006, 0.038],
      materials.concrete
    )
  ),
  turned(cylinder([0.32, 0.596, KEYBOARD_ALONG - 0.017], [0.014, 0.01, 0.014], materials.frame), [
    0,
    0,
    QUARTER_TURN
  ])
]

const TOWER_PARTS: readonly PartSpec[] = [
  box([TOWER_ACROSS, 0.22, TOWER_ALONG], [0.19, 0.4, 0.265], materials.keyboard),
  box([TOWER_ACROSS, 0.22, TOWER_ALONG - 0.135], [0.175, 0.38, 0.006], materials.frame),
  ...[-1, 1].map((side) =>
    box([TOWER_ACROSS + side * 0.064, 0.01, TOWER_ALONG], [0.04, 0.02, 0.22], materials.frame)
  ),
  ...Array.from({ length: 7 }, (_, vent) =>
    box(
      [TOWER_ACROSS, 0.095 + vent * 0.019, TOWER_ALONG - 0.14],
      [0.14, 0.007, 0.005],
      materials.concrete
    )
  ),
  ...Array.from({ length: 6 }, (_, vent) =>
    box(
      [TOWER_ACROSS + 0.097, 0.175, TOWER_ALONG - 0.065 + vent * 0.025],
      [0.004, 0.13, 0.011],
      materials.frame
    )
  ),
  turned(
    cylinder([TOWER_ACROSS, 0.375, TOWER_ALONG - 0.141], [0.025, 0.009, 0.025], materials.concrete),
    [QUARTER_TURN, 0, 0]
  ),
  ...[-0.028, 0.028].flatMap((offset) => [
    box(
      [TOWER_ACROSS + offset, 0.333, TOWER_ALONG - 0.14],
      [0.031, 0.015, 0.005],
      materials.concrete
    ),
    box([TOWER_ACROSS + offset, 0.333, TOWER_ALONG - 0.144], [0.023, 0.007, 0.003], materials.frame)
  ]),
  turned(
    cylinder(
      [TOWER_ACROSS + 0.055, 0.305, TOWER_ALONG - 0.14],
      [0.012, 0.006, 0.012],
      materials.concrete
    ),
    [QUARTER_TURN, 0, 0]
  )
]

const CABLE_PARTS: readonly PartSpec[] = [
  cylinder([0.27, 0.574, DESK_REACH + 0.24], [0.064, 0.008, 0.064], materials.concrete),
  cylinder([0.27, 0.577, DESK_REACH + 0.24], [0.045, 0.009, 0.045], materials.frame),
  box([0.17, 0.488, DESK_REACH + 0.22], [0.45, 0.028, 0.075], materials.keyboard),
  ...[-1, 1].map((side) =>
    box([0.17, 0.504, DESK_REACH + 0.22 + side * 0.034], [0.45, 0.025, 0.007], materials.frame)
  ),
  box([0.115, 0.745, SCREEN_ALONG + 0.077], [0.037, 0.014, 0.02], materials.frame),
  cylinder([0.115, 0.656, SCREEN_ALONG + 0.083], [0.007, 0.166, 0.007], materials.frame),
  box([0.19, 0.574, DESK_REACH + 0.22], [0.16, 0.007, 0.007], materials.frame),
  box([0.115, 0.574, DESK_REACH + 0.203], [0.007, 0.007, 0.038], materials.frame),
  box([0.27, 0.574, DESK_REACH + 0.23], [0.007, 0.007, 0.025], materials.frame),
  box([0.295, 0.574, DESK_REACH + 0.22], [0.057, 0.007, 0.007], materials.frame),
  cylinder([0.27, 0.46, DESK_REACH + 0.24], [0.008, 0.228, 0.008], materials.frame),
  box([0.31, 0.347, DESK_REACH + 0.24], [0.08, 0.007, 0.007], materials.frame),
  box([TOWER_ACROSS, 0.347, TOWER_ALONG + 0.136], [0.022, 0.014, 0.008], materials.frame),
  box([TOWER_ACROSS, 0.347, DESK_REACH + 0.223], [0.007, 0.007, 0.038], materials.frame),
  box([0.12, 0.574, DESK_REACH + 0.0475], [0.006, 0.006, 0.275], materials.frame),
  box([0.32, 0.574, DESK_REACH + 0.06], [0.006, 0.006, 0.334], materials.frame)
]

export const CORPORATE_COMPUTER_PARTS: readonly PartSpec[] = [
  ...MONITOR_PARTS,
  ...KEYBOARD_PARTS,
  ...MOUSE_PARTS,
  ...TOWER_PARTS,
  ...CABLE_PARTS
]

export const CORPORATE_DESK_PARTS: readonly PartSpec[] = [
  box([0, 0.54, DESK_REACH], [1.2, 0.06, 0.62], palette.wood),
  ...[-0.49, 0.49].flatMap((across) => [
    box([across, 0.28, DESK_REACH], [0.045, 0.5, 0.045], materials.frame),
    box([across, 0.035, DESK_REACH], [0.075, 0.04, 0.49], materials.frame)
  ]),
  box([0, 0.5, DESK_REACH + 0.2], [0.98, 0.055, 0.06], materials.frame),
  ...CORPORATE_COMPUTER_PARTS,
  ...TASK_CHAIR_PARTS
]

export const CORPORATE_LOUNGE_CHAIR_PARTS: readonly PartSpec[] = [
  ...[-0.18, 0.18].flatMap((across) =>
    [-0.18, 0.18].map((along) => box([across, 0.1175, along], [0.05, 0.195, 0.05], materials.frame))
  ),
  box([0, 0.255, 0], [0.48, 0.09, 0.48], palette.lacquer),
  box([0, 0.325, 0], [0.46, 0.06, 0.44], palette.paper),
  box([0, 0.495, -0.22], [0.48, 0.32, 0.08], palette.lacquer),
  box([0, 0.495, -0.173], [0.43, 0.26, 0.018], palette.paper)
]

export const CORPORATE_LOW_PLANTER_PARTS: readonly PartSpec[] = [
  box([0, 0.16, 0], [0.52, 0.32, 0.52], materials.concrete),
  box([0, 0.325, 0], [0.46, 0.015, 0.46], materials.frame),
  cylinder([-0.12, 0.45, -0.09], [0.17, 0.25, 0.17], materials.foliage),
  cylinder([0.11, 0.49, 0.07], [0.19, 0.32, 0.19], materials.park),
  cylinder([-0.08, 0.48, 0.12], [0.14, 0.29, 0.14], materials.foliage)
]
