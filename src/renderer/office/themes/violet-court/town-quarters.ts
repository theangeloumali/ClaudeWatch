import { FACADE_LAYER_STEP_M } from '../../scene/building-window-parts'
import type { ZoneDesign, ZonePlot } from '../../town/town-dress'
import { box, cone, cylinder, lit, SIDES, sphere, type PartSpec } from '../parts'
import { COURT } from './palette'

// A manor: a pale house with two lower wings, stepped roofs, chimneys and a hedge by the door.
function manor({ width, depth, height, accent }: ZonePlot): PartSpec[] {
  const wall = height * 0.56
  const eaves = 0.12 + wall
  const tier = (height - eaves) / 2
  const front = depth * 0.17 + 0.02
  return [
    box([0, 0.06, 0], [width, 0.12, depth], COURT.slate),
    box([0, 0.12 + wall / 2, -depth * 0.08], [width * 0.5, wall, depth * 0.5], COURT.marble),
    box([0, eaves + tier / 2, -depth * 0.08], [width * 0.54, tier, depth * 0.54], accent),
    box([0, eaves + tier * 1.5, -depth * 0.08], [width * 0.34, tier, depth * 0.3], accent),
    lit(box([0, 0.12 + wall * 0.7, front], [width * 0.4, wall * 0.14, 0.04], COURT.lumen)),
    box([0, 0.12 + wall * 0.22, front], [0.6, wall * 0.44, 0.04], COURT.crimson),
    box([0, 0.18, depth * 0.24], [width * 0.2, 0.12, depth * 0.14], COURT.marble),
    ...SIDES.flatMap((side) => [
      box(
        [side * width * 0.34, 0.12 + wall * 0.4, -depth * 0.08],
        [width * 0.2, wall * 0.8, depth * 0.4],
        COURT.ivory
      ),
      box(
        [side * width * 0.34, 0.12 + wall * 0.8 + tier * 0.4, -depth * 0.08],
        [width * 0.22, tier * 0.8, depth * 0.44],
        accent
      ),
      box(
        [side * width * 0.2, height - tier * 0.6, -depth * 0.2],
        [0.3, tier * 1.2, 0.3],
        COURT.ink
      ),
      sphere([side * width * 0.3, 0.45, depth * 0.36], [0.9, 0.7, 0.9], COURT.violet)
    ])
  ]
}

const LODGINGS = [-0.33, -0.11, 0.11, 0.33]

// A row of town lodgings: four narrow houses, wall to wall, every other one a little lower.
function townLodgings({ width, depth, height, accent }: ZonePlot): PartSpec[] {
  const front = depth * 0.15 + 0.02
  return [
    box([0, 0.06, 0], [width, 0.12, depth], COURT.slate),
    box([0, 0.15, depth * 0.36], [width * 0.9, 0.06, depth * 0.16], COURT.violet),
    ...LODGINGS.flatMap((spot, index) => {
      const isLow = index % 2 === 1
      const tall = (height - 0.12) * (isLow ? 0.86 : 1)
      const wall = tall * 0.72
      const tier = (tall - wall) / 2
      const x = spot * width
      return [
        box(
          [x, 0.12 + wall / 2, -depth * 0.1],
          [width * 0.2, wall, depth * 0.5],
          isLow ? COURT.marble : COURT.ivory
        ),
        box([x, 0.12 + wall + tier / 2, -depth * 0.1], [width * 0.22, tier, depth * 0.54], accent),
        box([x, 0.12 + wall + tier * 1.5, -depth * 0.1], [width * 0.12, tier, depth * 0.3], accent),
        box(
          [x, 0.12 + wall * 0.25, front],
          [0.4, wall * 0.5, 0.04],
          isLow ? COURT.crimson : COURT.ink
        ),
        lit(box([x, 0.12 + wall * 0.75, front], [width * 0.1, wall * 0.14, 0.04], COURT.lumen))
      ]
    })
  ]
}

// An alchemists' yard: a still tower under a pointed roof, a furnace with a tall flue, glass
// retorts and casks in a walled yard.
function alchemistsYard({ width, depth, height, accent }: ZonePlot): PartSpec[] {
  const girth = Math.min(width * 0.3, depth * 0.4)
  const tower = height * 0.72
  const furnace = height * 0.36
  return [
    box([0, 0.06, 0], [width, 0.12, depth], COURT.slate),
    cylinder([-width * 0.26, 0.12 + tower / 2, -depth * 0.2], [girth, tower, girth], COURT.marble),
    cylinder(
      [-width * 0.26, 0.06 + tower, -depth * 0.2],
      [girth * 1.04, 0.12, girth * 1.04],
      COURT.gold
    ),
    cone(
      [-width * 0.26, (0.12 + tower + height) / 2, -depth * 0.2],
      [girth * 1.1, height - 0.12 - tower, girth * 1.1],
      accent
    ),
    lit(
      box(
        [-width * 0.26, 0.12 + tower * 0.7, -depth * 0.2 + girth / 2],
        [0.3, tower * 0.14, 0.04],
        COURT.lumen
      )
    ),
    box(
      [width * 0.22, 0.12 + furnace / 2, -depth * 0.22],
      [width * 0.36, furnace, depth * 0.36],
      COURT.slate
    ),
    box([width * 0.22, 0.18 + furnace, -depth * 0.22], [width * 0.4, 0.12, depth * 0.4], accent),
    lit(
      box(
        [width * 0.22, 0.12 + furnace * 0.35, -depth * 0.04 + 0.02],
        [width * 0.14, furnace * 0.4, 0.04],
        COURT.lumen
      )
    ),
    box([width * 0.34, 0.12 + height * 0.42, -depth * 0.3], [0.4, height * 0.84, 0.4], COURT.ink),
    box([width * 0.34, 0.16 + height * 0.84, -depth * 0.3], [0.5, 0.08, 0.5], COURT.gold),
    box([-width * 0.1, 0.27, depth * 0.26], [0.5, 0.3, 0.5], COURT.ink),
    lit(sphere([-width * 0.1, 0.74, depth * 0.26], [0.7, 0.7, 0.7], COURT.lumen)),
    sphere([width * 0.08, 0.4, depth * 0.3], [0.5, 0.56, 0.5], COURT.violet),
    cylinder([width * 0.34, 0.42, depth * 0.26], [0.5, 0.6, 0.5], COURT.gold),
    cylinder([width * 0.24, 0.42, depth * 0.34], [0.5, 0.6, 0.5], COURT.crimson),
    ...SIDES.map((side) =>
      box([side * width * 0.32, 0.3, depth * 0.46], [width * 0.3, 0.36, 0.2], COURT.slate)
    )
  ]
}

const PORTCULLIS = [-0.06, 0, 0.06]
const SHIELDS = [-0.3, -0.2, 0.2, 0.3]

// An armoury: a buttressed hall with a barred gate, a row of shields and a brazier each side.
function armoury({ width, depth, height, accent }: ZonePlot): PartSpec[] {
  const hall = height * 0.62
  const eaves = 0.22 + hall
  const roof = height - eaves
  const front = depth * 0.27
  return [
    box([0, 0.06, 0], [width, 0.12, depth], COURT.slate),
    box([0, 0.12 + hall / 2, -depth * 0.06], [width * 0.8, hall, depth * 0.66], COURT.slate),
    lit(
      box(
        [0, 0.12 + hall * 0.88, -depth * 0.06],
        [width * 0.82, hall * 0.06, depth * 0.68],
        COURT.lumen
      )
    ),
    box([0, 0.17 + hall, -depth * 0.06], [width * 0.86, 0.1, depth * 0.72], COURT.gold),
    box([0, eaves + roof * 0.3, -depth * 0.06], [width * 0.76, roof * 0.6, depth * 0.62], accent),
    box([0, eaves + roof * 0.8, -depth * 0.06], [width * 0.44, roof * 0.4, depth * 0.3], accent),
    box([0, 0.12 + hall * 0.3, front + 0.02], [width * 0.22, hall * 0.6, 0.04], COURT.ink),
    ...PORTCULLIS.map((spot) =>
      box(
        [spot * width, 0.12 + hall * 0.3, front + 0.05],
        [0.05, hall * 0.6 - 2 * FACADE_LAYER_STEP_M, 0.03],
        COURT.gold
      )
    ),
    ...SHIELDS.map((spot, index) =>
      box(
        [spot * width, 0.12 + hall * 0.6, front + 0.03],
        [width * 0.07, hall * 0.18, 0.05],
        index % 2 ? COURT.crimson : COURT.gold
      )
    ),
    ...SIDES.flatMap((side) => [
      box(
        [side * width * 0.42, 0.12 + hall * 0.4, -depth * 0.06],
        [width * 0.06, hall * 0.8, depth * 0.7],
        COURT.ink
      ),
      cylinder([side * width * 0.2, 0.37, depth * 0.4], [0.4, 0.5, 0.4], COURT.marble),
      lit(box([side * width * 0.2, 0.7, depth * 0.4], [0.3, 0.16, 0.3], COURT.lumen))
    ])
  ]
}

export const COURT_QUARTER_DESIGNS: readonly ZoneDesign[] = [
  { name: 'manor', zones: ['residential'], height: { min: 2.6, max: 7 }, build: manor },
  {
    name: 'town-lodgings',
    zones: ['residential'],
    height: { min: 2.2, max: 6 },
    build: townLodgings
  },
  {
    name: 'alchemists-yard',
    zones: ['workshop'],
    height: { min: 2.6, max: 7 },
    build: alchemistsYard
  },
  { name: 'armoury', zones: ['workshop'], height: { min: 3, max: 8 }, build: armoury }
]
