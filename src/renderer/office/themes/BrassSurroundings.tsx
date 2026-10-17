import { FACADE_LAYER_STEP_M } from '../scene/building-window-parts'
import type { Plot } from './lot-kit'
import type { LotDesign } from './lot-parts'
import { BRASS } from './palettes'
import { box, cone, cylinder, lit, turned, type PartSpec } from './parts'

const { ink: iron, wood, brass, copper, glow } = BRASS
const ON_SIDE_X: [number, number, number] = [0, 0, Math.PI / 2]
// Room left above a smokestack for its steam to rise under the lot's limit.
const BRASS_STEAM_RISE_M = 1.3
const SHAFT_M = 2.6

// A flat iron roof with a raised monitor, 0.4 m tall.
const roof = (y: number, width: number, depth: number): PartSpec[] => [
  box([0, y + 0.08, 0], [width + 0.4, 0.16, depth + 0.4], iron),
  box([0, y + 0.28, 0], [width * 0.5, 0.24, depth * 0.7], iron)
]

// One lit box through the body, a little deeper than it, shows as windows on both faces.
const windows = (y: number, width: number, depth: number, height: number): PartSpec =>
  lit(box([0, y, 0], [width * 0.6, height, depth + 0.06], glow))

const corners = (width: number, depth: number, height: number): PartSpec[] =>
  [-1, 1].flatMap((x) =>
    [-1, 1].map((z) =>
      box([(x * width) / 2, height / 2, (z * depth) / 2], [0.18, height, 0.18], brass)
    )
  )

function warehouse({ width, depth, height }: Plot): PartSpec[] {
  const w = width - 0.6
  const d = depth - 0.6
  const body = Math.min(height - 0.4, 3.8)
  return [
    box([0, body / 2, 0], [w, body, d], wood),
    ...corners(w, d, body),
    windows(body * 0.72, w, d, body * 0.18),
    box([0, body * 0.26, d / 2 + 0.04], [1.4, body * 0.52, 0.06], brass),
    ...roof(body, w, d)
  ]
}

function pipeYard({ width, depth, height }: Plot): PartSpec[] {
  const k = Math.min(1, height / 2.4)
  const length = width - 1
  const pipe = (y: number, z: number): PartSpec[] => [
    turned(cylinder([0, y * k, z], [0.5 * k, length, 0.5 * k], copper), ON_SIDE_X),
    ...[-length / 4, length / 4].map((x) =>
      turned(cylinder([x, y * k, z], [0.62 * k, 0.12, 0.62 * k], brass), ON_SIDE_X)
    )
  ]
  return [
    ...[-length / 3, 0, length / 3].map((x) => box([x, 0.5 * k, 0], [0.2, k, depth - 1.6], iron)),
    ...[-0.6, 0, 0.6].flatMap((z) => pipe(1.25, z * k)),
    ...pipe(1.7, 0.3 * k),
    box([length / 2 - 0.2, 0.35 * k, depth / 2 - 1], [0.7, 0.7 * k, 0.7], wood)
  ]
}

function gasometer({ width, depth, height }: Plot): PartSpec[] {
  const across = Math.min(width, depth) - 1.6
  const tank = Math.min(height - 0.9, 3.6)
  const frame = across / 2 + 0.25
  return [
    cylinder([0, tank / 2, 0], [across, tank, across], copper),
    ...[0.33, 0.66, 1].map((share) =>
      cylinder([0, tank * share - 0.07, 0], [across + 0.12, 0.14, across + 0.12], brass)
    ),
    ...Array.from({ length: 6 }, (_, index) => {
      const angle = (index / 6) * Math.PI * 2
      return box(
        [Math.cos(angle) * frame, (tank + 0.7) / 2, Math.sin(angle) * frame],
        [0.16, tank + 0.7, 0.16],
        iron
      )
    }),
    cone([0, tank + 0.3, 0], [across, 0.6, across], copper)
  ]
}

function boilerHouse({ width, depth, height }: Plot): PartSpec[] {
  const w = width - 0.6
  const d = depth - 0.6
  const hall = Math.min(height - 1.8, 2.4)
  const drum = w - 0.8
  return [
    box([0, hall / 2, 0], [w, hall, d], iron),
    windows(hall * 0.68, w, d, hall * 0.22),
    box([0, hall * 0.28, d / 2 + 0.04], [1.2, hall * 0.56, 0.06], wood),
    turned(cylinder([0, hall + 0.55, 0], [1.1, drum, 1.1], copper), ON_SIDE_X),
    ...[-drum / 3, 0, drum / 3].map((x) =>
      turned(cylinder([x, hall + 0.55, 0], [1.22, 0.14, 1.22], brass), ON_SIDE_X)
    ),
    box([0, hall + 1.3, 0], [0.2, 0.4, 0.2], brass)
  ]
}

// Where the foundry's smokestacks end, in the plot's own metres: their steam starts there.
function brassStacksOf({ width, depth, height }: Plot): { x: number; z: number; top: number }[] {
  const hall = Math.min(height - 2.8, 3.4)
  const top = Math.min(height - BRASS_STEAM_RISE_M, hall + 4)
  return [-1, 1].map((side) => ({ x: (width - 0.6) / 2 - 0.8, z: (side * (depth - 0.6)) / 4, top }))
}

function foundry(plot: Plot): PartSpec[] {
  const w = plot.width - 0.6
  const d = plot.depth - 0.6
  const hall = Math.min(plot.height - 2.8, 3.4)
  const bay = w / 3
  return [
    box([0, hall / 2, 0], [w, hall, d], wood),
    // flicker-1: the posts stand a layer step proud of the hall roof.
    ...corners(w, d, hall + FACADE_LAYER_STEP_M),
    windows(hall * 0.7, w, d, hall * 0.2),
    ...[-1, 0, 1].map((step) =>
      box([step * bay, hall + 0.25, 0], [bay - 0.12, 0.5, d + 0.2], iron)
    ),
    ...brassStacksOf(plot).flatMap((stack) => [
      cylinder([stack.x, stack.top / 2, stack.z], [0.7, stack.top, 0.7], copper),
      cylinder([stack.x, stack.top - 0.3, stack.z], [0.84, 0.14, 0.84], brass)
    ])
  ]
}

function clockTower({ width, depth, height }: Plot): PartSpec[] {
  const shaft = Math.min(height - 1.8, 16)
  const base = Math.min(width, depth) - 1
  return [
    box([0, 0.8, 0], [base, 1.6, base], wood),
    box([0, shaft / 2, 0], [SHAFT_M, shaft, SHAFT_M], iron),
    ...corners(SHAFT_M, SHAFT_M, shaft),
    lit(box([0, shaft - 1.3, 0], [1.3, 1.3, SHAFT_M + 0.08], glow)),
    box([0, shaft + 0.1, 0], [SHAFT_M + 0.5, 0.2, SHAFT_M + 0.5], iron),
    cone([0, shaft + 0.9, 0], [SHAFT_M + 0.5, 1.4, SHAFT_M + 0.5], copper)
  ]
}

export const BRASS_CLOCK_TOWER = 'clock tower'

export const BRASS_BUILDINGS: readonly LotDesign[] = [
  { name: 'warehouse', minHeight: 2, parts: warehouse },
  { name: 'pipe yard', minHeight: 2, parts: pipeYard },
  { name: 'gasometer', minHeight: 3, parts: gasometer },
  { name: 'boiler house', minHeight: 3, parts: boilerHouse },
  { name: 'foundry', minHeight: 5, parts: foundry },
  { name: BRASS_CLOCK_TOWER, minHeight: 7, parts: clockTower }
]
