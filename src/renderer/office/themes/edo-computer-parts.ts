import { DESK_REACH } from '../logic/room-layout'
import { EDO } from './palettes'
import { box, cylinder, turned, type PartSpec } from './parts'
import { WORKSTATIONS } from './workstations'

// dry-new: EdoDesk's bespoke boxes cannot batch a faceted CRT and individual keycaps.
const SCREEN = WORKSTATIONS.edo
const [SCREEN_ACROSS, SCREEN_HEIGHT, SCREEN_ALONG] = SCREEN.screen
const KEYBOARD_ALONG = DESK_REACH - 0.18
const TOWER_ACROSS = -0.275
const TOWER_ALONG = DESK_REACH + 0.09
const FACE_GAP = 0.004
const QUARTER_TURN = Math.PI / 2

const CRT_PARTS: readonly PartSpec[] = [
  box(
    [SCREEN_ACROSS, SCREEN_HEIGHT, SCREEN_ALONG + FACE_GAP + 0.003],
    [SCREEN.width, SCREEN.height, 0.006],
    EDO.ink
  ),
  ...[-1, 1].flatMap((side) => [
    box(
      [SCREEN_ACROSS + side * (SCREEN.width / 2 + 0.0165), SCREEN_HEIGHT, SCREEN_ALONG + 0.0185],
      [0.033, SCREEN.height + 0.06, 0.029],
      EDO.brass
    ),
    box(
      [SCREEN_ACROSS, SCREEN_HEIGHT + side * (SCREEN.height / 2 + 0.015), SCREEN_ALONG + 0.0185],
      [SCREEN.width + 0.066, 0.03, 0.029],
      EDO.brass
    ),
    turned(
      box([side * 0.175, SCREEN_HEIGHT, SCREEN_ALONG + 0.133], [0.022, 0.26, 0.125], EDO.brass),
      [0, -side * 0.3, 0]
    )
  ]),
  box([0, SCREEN_HEIGHT, SCREEN_ALONG + 0.066], [0.385, 0.285, 0.102], EDO.brass),
  box([0, SCREEN_HEIGHT - 0.004, SCREEN_ALONG + 0.173], [0.314, 0.255, 0.132], EDO.brass),
  box([0, 0.494, SCREEN_ALONG + 0.087], [0.37, 0.018, 0.2], EDO.ink),
  box([0, 0.511, SCREEN_ALONG + 0.1], [0.2, 0.016, 0.1], EDO.brass),
  ...[-0.145, 0.145].flatMap((across) => [
    turned(
      cylinder(
        [across, SCREEN_HEIGHT - 0.14, SCREEN_ALONG + 0.016],
        [0.023, 0.012, 0.023],
        EDO.copper
      ),
      [QUARTER_TURN, 0, 0]
    ),
    box([across, SCREEN_HEIGHT - 0.14, SCREEN_ALONG + 0.009], [0.002, 0.012, 0.002], EDO.ink)
  ]),
  box([0.094, SCREEN_HEIGHT - 0.14, SCREEN_ALONG + 0.009], [0.009, 0.005, 0.005], EDO.gold),
  ...Array.from({ length: 9 }, (_, vent) =>
    box(
      [-0.12 + vent * 0.03, SCREEN_HEIGHT + 0.01, SCREEN_ALONG + 0.241],
      [0.011, 0.105, 0.005],
      EDO.ink
    )
  ),
  ...[-0.09, -0.045, 0, 0.045, 0.09].map((across) =>
    box([across, SCREEN_HEIGHT + 0.145, SCREEN_ALONG + 0.092], [0.016, 0.004, 0.07], EDO.ink)
  )
]

const KEYBOARD_PARTS: readonly PartSpec[] = [
  box([0, 0.4975, KEYBOARD_ALONG], [0.34, 0.025, 0.13], EDO.ink),
  ...[0.417, 0.438, 0.459, 0.48].flatMap((along, row) =>
    Array.from({ length: 10 }, (_, column) =>
      box(
        [-0.135 + column * 0.027 + (row % 2) * 0.003, 0.513, along],
        [0.018, 0.006, 0.018],
        EDO.paper
      )
    )
  ),
  ...Array.from({ length: 7 }, (_, column) =>
    box([-0.135 + column * 0.045, 0.513, 0.497], [0.012, 0.006, 0.012], EDO.copper)
  ),
  box([0, 0.513, 0.394], [0.105, 0.006, 0.017], EDO.brass),
  ...[-0.135, -0.085, 0.085, 0.135].map((across) =>
    box([across, 0.513, 0.394], [0.026, 0.006, 0.017], EDO.copper)
  )
]

const MOUSE_PARTS: readonly PartSpec[] = [
  ...[-0.02, 0.02].map((offset) =>
    cylinder([0.3, 0.496, KEYBOARD_ALONG + offset], [0.064, 0.022, 0.064], EDO.copper)
  ),
  box([0.3, 0.496, KEYBOARD_ALONG], [0.064, 0.022, 0.04], EDO.copper),
  ...[-1, 1].map((side) =>
    box([0.3 + side * 0.017, 0.51, KEYBOARD_ALONG - 0.02], [0.026, 0.006, 0.037], EDO.brass)
  ),
  turned(cylinder([0.3, 0.514, KEYBOARD_ALONG - 0.018], [0.013, 0.012, 0.013], EDO.gold), [
    0,
    0,
    QUARTER_TURN
  ])
]

const TOWER_PARTS: readonly PartSpec[] = [
  box([TOWER_ACROSS, 0.205, TOWER_ALONG], [0.19, 0.37, 0.265], EDO.brass),
  box([TOWER_ACROSS, 0.205, TOWER_ALONG - 0.135], [0.175, 0.35, 0.006], EDO.ink),
  box([TOWER_ACROSS - 0.097, 0.205, TOWER_ALONG], [0.004, 0.32, 0.24], EDO.copper),
  ...[-1, 1].map((side) =>
    box([TOWER_ACROSS + side * 0.062, 0.01, TOWER_ALONG], [0.04, 0.02, 0.22], EDO.ink)
  ),
  ...Array.from({ length: 7 }, (_, vent) =>
    box([TOWER_ACROSS, 0.08 + vent * 0.019, TOWER_ALONG - 0.14], [0.14, 0.007, 0.005], EDO.brass)
  ),
  ...Array.from({ length: 6 }, (_, vent) =>
    box(
      [TOWER_ACROSS - 0.1, 0.175, TOWER_ALONG - 0.06 + vent * 0.025],
      [0.004, 0.12, 0.011],
      EDO.ink
    )
  ),
  turned(
    cylinder([TOWER_ACROSS + 0.052, 0.345, TOWER_ALONG - 0.143], [0.025, 0.012, 0.025], EDO.copper),
    [QUARTER_TURN, 0, 0]
  ),
  ...[-0.029, 0.025].flatMap((offset) => [
    box([TOWER_ACROSS + offset, 0.26, TOWER_ALONG - 0.14], [0.031, 0.016, 0.005], EDO.copper),
    box([TOWER_ACROSS + offset, 0.26, TOWER_ALONG - 0.144], [0.023, 0.008, 0.003], EDO.ink)
  ]),
  turned(
    cylinder([TOWER_ACROSS - 0.028, 0.326, TOWER_ALONG - 0.142], [0.052, 0.012, 0.052], EDO.brass),
    [QUARTER_TURN, 0, 0]
  ),
  turned(
    cylinder([TOWER_ACROSS - 0.028, 0.326, TOWER_ALONG - 0.15], [0.04, 0.005, 0.04], EDO.paper),
    [QUARTER_TURN, 0, 0]
  ),
  turned(
    box([TOWER_ACROSS - 0.026, 0.332, TOWER_ALONG - 0.154], [0.003, 0.021, 0.003], EDO.ink),
    [0, 0, -0.5]
  )
]

const CABLE_PARTS: readonly PartSpec[] = [
  cylinder([-0.27, 0.489, DESK_REACH + 0.25], [0.06, 0.008, 0.06], EDO.brass),
  cylinder([-0.27, 0.492, DESK_REACH + 0.25], [0.045, 0.009, 0.045], EDO.ink),
  box([0.075, 0.35, DESK_REACH + 0.22], [0.44, 0.025, 0.075], EDO.brass),
  ...[-1, 1].map((side) =>
    box([0.075, 0.366, DESK_REACH + 0.22 + side * 0.034], [0.44, 0.022, 0.007], EDO.ink)
  ),
  box([-0.105, 0.555, SCREEN_ALONG + 0.245], [0.028, 0.015, 0.019], EDO.copper),
  cylinder([-0.105, 0.524, SCREEN_ALONG + 0.25], [0.007, 0.07, 0.007], EDO.ink),
  box([-0.187, 0.489, DESK_REACH + 0.15], [0.17, 0.007, 0.007], EDO.ink),
  box([-0.27, 0.489, DESK_REACH + 0.2], [0.007, 0.007, 0.1], EDO.ink),
  box([0.015, 0.489, DESK_REACH + 0.25], [0.57, 0.007, 0.007], EDO.ink),
  box([0.3, 0.489, DESK_REACH + 0.23], [0.007, 0.007, 0.04], EDO.ink),
  cylinder([-0.27, 0.419, DESK_REACH + 0.25], [0.008, 0.14, 0.008], EDO.ink),
  cylinder([TOWER_ACROSS - 0.007, 0.425, DESK_REACH + 0.25], [0.008, 0.13, 0.008], EDO.copper),
  box([-0.276, 0.352, DESK_REACH + 0.25], [0.024, 0.007, 0.007], EDO.ink),
  box([0.01, 0.367, DESK_REACH + 0.25], [0.56, 0.007, 0.007], EDO.ink),
  box([TOWER_ACROSS, 0.352, TOWER_ALONG + 0.139], [0.022, 0.014, 0.012], EDO.copper),
  box([TOWER_ACROSS, 0.352, DESK_REACH + 0.239], [0.007, 0.007, 0.034], EDO.ink),
  box([0.12, 0.489, DESK_REACH - 0.065], [0.006, 0.006, 0.1], EDO.ink),
  box([0.3, 0.489, DESK_REACH + 0.04], [0.006, 0.006, 0.34], EDO.ink)
]

export const EDO_COMPUTER_PARTS: readonly PartSpec[] = [
  ...CRT_PARTS,
  ...KEYBOARD_PARTS,
  ...MOUSE_PARTS,
  ...TOWER_PARTS,
  ...CABLE_PARTS
]

export const EDO_DESK_PARTS: readonly PartSpec[] = [
  box([0, 0.44, DESK_REACH], [1.2, 0.09, 0.65], EDO.wood),
  ...[-0.45, 0.45].map((across) => box([across, 0.21, DESK_REACH], [0.1, 0.42, 0.5], EDO.wood)),
  ...EDO_COMPUTER_PARTS
]
