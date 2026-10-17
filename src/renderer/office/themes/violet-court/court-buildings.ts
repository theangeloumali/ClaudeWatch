import { FACADE_LAYER_STEP_M } from '../../scene/building-window-parts'
import { box, CORNERS, lit, SIDES, type PartSpec, cone, cylinder, sphere } from '../parts'
import type { BuildingDesign, Plot } from '../lot-kit'
import { COURT } from './palette'

// A formal garden: a violet lawn crossed by two paths, a fountain and four clipped shrubs.
function parterre({ width, depth, height }: Plot): PartSpec[] {
  return [
    box([0, 0.06, 0], [width, 0.12, depth], COURT.slate),
    box([0, 0.14, 0], [width * 0.86, 0.06, depth * 0.86], COURT.violet),
    box([0, 0.175, 0], [width * 0.9, 0.03, 0.6], COURT.slate),
    box([0, 0.175, 0], [0.6, 0.03, depth * 0.9], COURT.slate),
    cylinder([0, 0.27, 0], [1.4, 0.3, 1.4], COURT.marble),
    cylinder([0, height / 2, 0], [0.3, height - 0.3, 0.3], COURT.marble),
    sphere([0, height - 0.2, 0], [0.4, 0.4, 0.4], COURT.violet),
    ...CORNERS.map(({ x, z }) =>
      sphere([x * width * 0.34, 0.42, z * depth * 0.34], [0.7, 0.55, 0.7], COURT.violet)
    )
  ]
}

const COLUMN_SPOTS = [-0.42, -0.14, 0.14, 0.42]

// An open hall: two rows of marble columns under a gilded beam and a dark roof.
function colonnade({ width, depth, height }: Plot): PartSpec[] {
  const shaft = height - 0.7
  return [
    box([0, 0.1, 0], [width, 0.2, depth], COURT.slate),
    ...SIDES.flatMap((side) => [
      ...COLUMN_SPOTS.map((spot) =>
        cylinder(
          [spot * width, 0.2 + shaft / 2, side * depth * 0.36],
          [0.36, shaft, 0.36],
          COURT.marble
        )
      ),
      box([0, height - 0.4, side * depth * 0.36], [width * 0.96, 0.2, 0.5], COURT.gold)
    ]),
    box([0, height - 0.2, 0], [width, 0.2, depth * 0.9], COURT.ink),
    box([0, height - 0.05, 0], [width * 0.7, 0.1, depth * 0.4], COURT.violet),
    box([0, 0.5, 0], [0.5, 0.6, 0.5], COURT.slate),
    lit(box([0, 0.86, 0], [0.36, 0.12, 0.36], COURT.lumen))
  ]
}

// A knight frame at rest, as plain armour blocks: it is read from across the district.
function parkedFrame(tall: number): PartSpec[] {
  const at = (share: number): number => 0.12 + share * tall
  return [
    ...SIDES.flatMap((side) => [
      box([side * 0.14 * tall, at(0.22), 0], [0.14 * tall, 0.44 * tall, 0.18 * tall], COURT.ink),
      box([side * 0.3 * tall, at(0.74), 0], [0.2 * tall, 0.14 * tall, 0.3 * tall], COURT.gold)
    ]),
    box(
      [0, at(0.6), 0],
      [0.42 * tall + 2 * FACADE_LAYER_STEP_M, 0.34 * tall, 0.26 * tall],
      COURT.violet
    ),
    box([0, at(0.86), 0.02], [0.14 * tall, 0.14 * tall, 0.16 * tall], COURT.ink),
    cone([0, at(0.96), 0], [0.08 * tall, 0.1 * tall, 0.08 * tall], COURT.gold)
  ]
}

// A frame hangar: a gantry of dark posts and gilded beams over one parked frame.
function frameHangar({ width, depth, height }: Plot): PartSpec[] {
  return [
    box([0, 0.06, 0], [width, 0.12, depth], COURT.slate),
    ...CORNERS.map(({ x, z }) =>
      box([x * width * 0.44, height / 2, z * depth * 0.4], [0.26, height, 0.26], COURT.ink)
    ),
    ...SIDES.map((side) =>
      box([0, height - 0.14, side * depth * 0.4], [width, 0.22, 0.3], COURT.gold)
    ),
    box([0, height - 0.3, 0], [0.3, 0.2, depth * 0.8], COURT.ink),
    lit(box([0, height - 0.44, 0], [width * 0.5, 0.06, 0.2], COURT.lumen)),
    // Its shoulders are 0.8 of its height across: kept inside the gantry on a narrow lot.
    ...parkedFrame(Math.min(height - 0.8, width - 0.4))
  ]
}

// The academy: a hall with a lit window band under a stepped roof, between two round towers.
function academy({ width, depth, height }: Plot): PartSpec[] {
  const hall = height * 0.55
  const tier = height * 0.12
  const eaves = 0.42 + hall
  const tower = height * 0.8
  return [
    box([0, 0.15, 0], [width, 0.3, depth], COURT.slate),
    box([0, 0.3 + hall / 2, 0], [width * 0.78, hall, depth * 0.7], COURT.slate),
    lit(box([0, 0.3 + hall * 0.55, 0], [width * 0.8, 0.28, depth * 0.72], COURT.lumen)),
    box([0, 0.36 + hall, 0], [width * 0.84, 0.12, depth * 0.76], COURT.gold),
    box([0, eaves + tier / 2, 0], [width * 0.7, tier, depth * 0.6], COURT.ink),
    box([0, eaves + tier * 1.5, 0], [width * 0.46, tier, depth * 0.4], COURT.violet),
    // Its depth scales with the lot, so it always stands proud of the window band.
    box([0, 0.8, depth * 0.355 + 0.02], [0.9, 1, depth * 0.01 + 0.04], COURT.violet),
    ...SIDES.flatMap((side) => {
      const x = side * (width / 2 - 0.55)
      const z = depth / 2 - 0.55
      return [
        cylinder([x, tower / 2, z], [0.9, tower, 0.9], COURT.marble),
        cone([x, tower + height * 0.1, z], [1, height * 0.2, 1], COURT.gold)
      ]
    })
  ]
}

// A bell tower: a marble shaft, an open lit belfry, a violet dome and a gold finial.
function bellTower({ width, depth, height }: Plot): PartSpec[] {
  const span = Math.min(width, depth)
  const shaft = height * 0.62
  const belfry = height * 0.12
  const dome = height * 0.14
  const belfryFloor = 0.48 + shaft
  const finialFoot = belfryFloor + belfry + dome * 0.6
  const finial = height - finialFoot
  return [
    box([0, 0.2, 0], [span * 0.7, 0.4, span * 0.7], COURT.slate),
    cylinder([0, 0.4 + shaft / 2, 0], [span * 0.36, shaft, span * 0.36], COURT.marble),
    box([0, 0.4 + shaft * 0.6, span * 0.19], [0.5, shaft * 0.3, 0.04], COURT.violet),
    box([0, 0.44 + shaft, 0], [span * 0.44, 0.08, span * 0.44], COURT.gold),
    ...CORNERS.map(({ x, z }) =>
      box(
        [x * span * 0.14, belfryFloor + belfry / 2, z * span * 0.14],
        [0.14, belfry, 0.14],
        COURT.ink
      )
    ),
    lit(
      box([0, belfryFloor + belfry / 2, 0], [span * 0.14, belfry * 0.6, span * 0.14], COURT.lumen)
    ),
    sphere(
      [0, belfryFloor + belfry + dome * 0.25, 0],
      [span * 0.4, dome, span * 0.4],
      COURT.violet
    ),
    cone([0, finialFoot + finial / 2, 0], [0.3, finial, 0.3], COURT.gold)
  ]
}

// The keep: three shrinking tiers with lit window bands, corner turrets and a gold spire.
function keep({ width, depth, height }: Plot): PartSpec[] {
  const span = Math.min(width, depth)
  return [
    box([0, height * 0.3, 0], [width * 0.9, height * 0.6, depth * 0.9], COURT.slate),
    box([0, height * 0.72, 0], [width * 0.64, height * 0.24, depth * 0.64], COURT.ink),
    box([0, height * 0.89, 0], [width * 0.4, height * 0.1, depth * 0.4], COURT.violet),
    cone([0, height * 0.97, 0], [span * 0.26, height * 0.06, span * 0.26], COURT.gold),
    box([0, height * 0.6, 0], [width * 0.94, 0.1, depth * 0.94], COURT.gold),
    ...[0.2, 0.4].map((level) =>
      lit(box([0, height * level, 0], [width * 0.92, 0.14, depth * 0.92], COURT.lumen))
    ),
    lit(box([0, height * 0.72, 0], [width * 0.66, 0.12, depth * 0.66], COURT.lumen)),
    ...CORNERS.flatMap(({ x, z }) => {
      const at = { x: x * (width / 2 - 0.46), z: z * (depth / 2 - 0.46) }
      return [
        cylinder([at.x, height * 0.34, at.z], [0.8, height * 0.68, 0.8], COURT.marble),
        cone([at.x, height * 0.72, at.z], [0.9, height * 0.08, 0.9], COURT.gold)
      ]
    })
  ]
}

export const COURT_BUILDINGS: readonly BuildingDesign[] = [
  { name: 'parterre', height: { min: 0.8, max: 1.1 }, build: parterre },
  { name: 'colonnade', height: { min: 2, max: 3.2 }, build: colonnade },
  { name: 'frame-hangar', height: { min: 2.6, max: 6 }, build: frameHangar },
  { name: 'academy', height: { min: 3.4, max: 10 }, build: academy },
  { name: 'bell-tower', height: { min: 4.5, max: 14 }, build: bellTower },
  { name: 'keep', height: { min: 8, max: 24 }, build: keep }
]
