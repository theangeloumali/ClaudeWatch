import { FACADE_LAYER_STEP_M } from '../../scene/building-window-parts'
import type { Vector } from '../primitives'
import { box, lit, SIDES, type PartSpec } from '../parts'
import { frameParts } from './frame-parts'
import { GARRISON } from './palette'
import { scaled } from './placed'

// Every design stands on a pad this wide, feet at y 0, and is scaled to its lot afterwards.
export const BUILDING_SIDE_M = 6

export interface YardDesign {
  id: string
  // The lowest height limit the design still reads at.
  minHeight: number
  // Built no taller than `limit`; `share` in [0, 1) varies its proportions.
  build: (limit: number, share: number) => PartSpec[]
}

export const drum = (at: Vector, size: Vector, color: string): PartSpec => ({
  shape: 'cylinder',
  at,
  size,
  color
})

const PAD: PartSpec[] = [
  box([0, 0.05, 0], [BUILDING_SIDE_M, 0.1, BUILDING_SIDE_M], GARRISON.hull),
  box([0, 0.11, 2.9], [BUILDING_SIDE_M, 0.02, 0.14], GARRISON.orange)
]

// A wide maintenance shed: ribbed walls, a pale roof and a door under a hazard lintel.
function hangar(limit: number, share: number): PartSpec[] {
  const height = Math.min(limit, 3 + share * 1.4)
  return [
    ...PAD,
    box([0, height * 0.45, -0.3], [5.4, height * 0.9, 4.6], GARRISON.gunmetal),
    // flicker-1: the roof ribs and wall ribs each end a layer step past what they meet.
    box(
      [0, height - 0.08 - FACADE_LAYER_STEP_M / 2, -0.3],
      [5.7, 0.16 - FACADE_LAYER_STEP_M, 4.9],
      GARRISON.white
    ),
    box([0, height * 0.36, 2.02], [3.6, height * 0.72, 0.06], GARRISON.hull),
    box([0, height * 0.75, 2.04], [3.8, 0.14, 0.08], GARRISON.orange),
    lit(box([0, height * 0.84, 2.03], [1.2, 0.08, 0.06], GARRISON.ice)),
    ...SIDES.map((side) =>
      box(
        [side * 2.74, (height * 0.9 + FACADE_LAYER_STEP_M) / 2, -0.3],
        [0.1, height * 0.9 + FACADE_LAYER_STEP_M, 4.7],
        GARRISON.steel
      )
    ),
    ...[-1.5, 0, 1.2].map((z) => box([0, height - 0.01, z], [5.5, 0.02, 0.12], GARRISON.steel))
  ]
}

const STOREY_M = 1.5

// A barracks block: stacked decks with a lit window band each, and a stair tower behind.
function barracks(limit: number, share: number): PartSpec[] {
  const storeys = Math.max(1, Math.min(Math.floor((limit - 0.3) / STOREY_M), (2 + share * 3) | 0))
  const roofY = 0.1 + storeys * STOREY_M
  return [
    ...PAD,
    ...Array.from({ length: storeys }, (_, storey): PartSpec[] => {
      const y = 0.1 + storey * STOREY_M
      return [
        box([0.3, y + 0.7, 0.2], [5, 1.4, 3.6], GARRISON.gunmetal),
        lit(box([0.3, y + 0.85, 2.01], [4.4, 0.28, 0.04], GARRISON.ice)),
        box([0.3, y + 1.45, 0.2], [5.2, 0.1, 3.8], GARRISON.steel)
      ]
    }).flat(),
    box([0.3, roofY + 0.05, 0.2], [4.6, 0.1, 3.2], GARRISON.white),
    box([-2.4, roofY / 2, -2.2], [1, roofY, 1], GARRISON.hull),
    box([1.4, 0.6, 2.02], [0.7, 1, 0.05], GARRISON.orange)
  ]
}

// A fuel farm: four pale tanks on a bunded pad, piped together, a valve block by each.
function tankFarm(limit: number, share: number): PartSpec[] {
  const height = Math.min(limit - 0.25, 2.4 + share * 1.6)
  return [
    ...PAD,
    ...SIDES.flatMap((across) =>
      SIDES.flatMap((along) => [
        drum(
          [across * 1.4, 0.1 + height / 2, along * 1.4 - 0.2],
          [2.3, height, 2.3],
          GARRISON.white
        ),
        drum([across * 1.4, 0.16 + height, along * 1.4 - 0.2], [1.6, 0.12, 1.6], GARRISON.steel),
        box([across * 2.7, 0.35, along * 1.4 - 0.2], [0.3, 0.5, 0.4], GARRISON.orange)
      ])
    ),
    box([0, 0.5, -0.2], [0.16, 0.16, 5], GARRISON.steel),
    box([0, 0.5, -0.2], [5.2, 0.16, 0.16], GARRISON.steel)
  ]
}

const RADAR_PEDESTAL_M = 0.4
// How far a dish reaches above its pedestal: a radar tower leaves that much under its limit.
export const DISH_REACH_M = 1.1
const DISH_HEADROOM_M = RADAR_PEDESTAL_M + DISH_REACH_M

// A squat radar block: a windowed shaft, a railed deck and the pedestal a dish turns on.
function radarTower(limit: number, share: number): PartSpec[] {
  const deck = radarDeckHeight(limit, share)
  return [
    ...PAD,
    box([0, deck / 2, 0], [2.6, deck, 2.6], GARRISON.gunmetal),
    lit(box([0, deck * 0.7, 0], [2.64, 0.24, 2.64], GARRISON.ice)),
    box([0, deck * 0.3, 0], [2.66, 0.16, 2.66], GARRISON.orange),
    box([0, deck + 0.07, 0], [3.4, 0.14, 3.4], GARRISON.steel),
    drum([0, deck + 0.27, 0], [0.7, 0.26, 0.7], GARRISON.steel),
    box([1.9, 0.7, 1.7], [1.6, 1.2, 1.4], GARRISON.gunmetal),
    box([1.9, 1.35, 1.7], [1.7, 0.1, 1.5], GARRISON.white)
  ]
}

// Where the dish sits on a radar tower built to `limit`, above the design's own feet.
function radarDeckHeight(limit: number, share: number): number {
  return Math.min(limit, 4.6 + share * 3) - DISH_HEADROOM_M
}

// A slender control tower: a banded shaft under a glazed cab, a roof and a short mast.
function controlTower(limit: number, share: number): PartSpec[] {
  const height = Math.min(limit, 7 + share * 5)
  return [
    ...PAD,
    box([0, (height - 2.2) / 2, 0], [1.6, height - 2.2, 1.6], GARRISON.gunmetal),
    box([0, (height - 2.2) * 0.55, 0], [1.7, 0.24, 1.7], GARRISON.orange),
    box([0, height - 2.1, 0], [3, 0.2, 3], GARRISON.steel),
    lit(box([0, height - 1.55, 0], [2.7, 0.9, 2.7], GARRISON.ice)),
    ...SIDES.flatMap((across) =>
      SIDES.map((along) =>
        box([across * 1.36, height - 1.55, along * 1.36], [0.12, 0.9, 0.12], GARRISON.hull)
      )
    ),
    box([0, height - 1, 0], [3.3, 0.2, 3.3], GARRISON.white),
    box([0, height - 0.55, 0], [0.1, 0.7, 0.1], GARRISON.white),
    box([0, height - 0.1, 0], [0.3, 0.2, 0.3], GARRISON.orange),
    box([1.2, 0.9, 1.6], [3, 1.6, 2], GARRISON.gunmetal),
    box([1.2, 1.75, 1.6], [3.1, 0.1, 2.1], GARRISON.white)
  ]
}

const RING_EVERY_M = 2.2

// A lattice comms mast: four legs braced every few metres, panel aerials and a beacon.
function commsTower(limit: number, share: number): PartSpec[] {
  const height = Math.min(limit, 10 + share * 8)
  const lattice = height * 0.78
  const rings = Math.floor(lattice / RING_EVERY_M)
  return [
    ...PAD,
    ...SIDES.flatMap((across) =>
      SIDES.map((along) =>
        box([across * 0.7, lattice / 2, along * 0.7], [0.14, lattice, 0.14], GARRISON.steel)
      )
    ),
    ...Array.from({ length: rings }, (_, ring) =>
      SIDES.flatMap((side) => [
        box([0, (ring + 1) * RING_EVERY_M, side * 0.7], [1.54, 0.08, 0.08], GARRISON.steel),
        box([side * 0.7, (ring + 1) * RING_EVERY_M, 0], [0.08, 0.08, 1.54], GARRISON.steel)
      ])
    ).flat(),
    box([0, lattice + 0.06, 0], [2.2, 0.12, 2.2], GARRISON.gunmetal),
    ...SIDES.flatMap((side) => [
      box([side * 1.16, lattice - 0.7, 0], [0.12, 1, 0.5], GARRISON.white),
      box([0, lattice - 1.6, side * 1.16], [0.5, 1, 0.12], GARRISON.white),
      box([0, lattice + 0.4, side * 1.07], [2.2, 0.06, 0.06], GARRISON.orange)
    ]),
    box([0, (lattice + height) / 2, 0], [0.16, height - lattice - 0.2, 0.16], GARRISON.white),
    lit(box([0, height - 0.11, 0], [0.26, 0.22, 0.26], GARRISON.ice)),
    box([-1.8, 0.75, 1.8], [1.8, 1.3, 1.6], GARRISON.gunmetal),
    box([-1.8, 1.45, 1.8], [1.9, 0.1, 1.7], GARRISON.white)
  ]
}

// The tallest part of a parked frame: its comms mast.
const FRAME_TOP_M = 2.25
// The thruster cones would be a material no other lot uses: one more draw for four small parts.
const PARKED_FRAME = frameParts('trooper').filter((part) => part.shape !== 'cone')

// An open frame pad: a line trooper parked under a service gantry, crates beside it.
function framePad(limit: number, share: number): PartSpec[] {
  const scale = Math.min((limit - 0.4) / FRAME_TOP_M, 1.6 + share * 0.8)
  const beamY = FRAME_TOP_M * scale + 0.25
  return [
    ...PAD,
    ...scaled(PARKED_FRAME, scale, 0.1),
    ...SIDES.map((side) => box([side * 2.5, beamY / 2, -1.2], [0.2, beamY, 0.2], GARRISON.steel)),
    box([0, beamY, -1.2], [5.3, 0.24, 0.24], GARRISON.orange),
    box([2.1, 0.45, 1.9], [0.9, 0.7, 0.9], GARRISON.orange),
    box([-2.2, 0.35, 2], [0.7, 0.5, 0.7], GARRISON.steel),
    box([-2.2, 0.72, 2], [0.45, 0.24, 0.45], GARRISON.white)
  ]
}

export const BUILDINGS: readonly YardDesign[] = [
  { id: 'hangar', minHeight: 2, build: hangar },
  { id: 'barracks', minHeight: 2, build: barracks },
  { id: 'tank-farm', minHeight: 2, build: tankFarm },
  { id: 'frame-pad', minHeight: 2, build: framePad },
  { id: 'radar-tower', minHeight: 4, build: radarTower },
  { id: 'control-tower', minHeight: 6, build: controlTower },
  { id: 'comms-tower', minHeight: 9, build: commsTower }
]
