import { FACADE_LAYER_STEP_M } from '../scene/building-window-parts'
import { clamp } from '../../../shared/range'
import type { Plot } from './lot-kit'
import type { LotDesign } from './lot-parts'
import { EDO } from './palettes'
import { box, cone, lit, sphere, type PartSpec } from './parts'

const { wood, ink, paper, lacquer, glow, copper, blossom } = EDO

const ROOF_M = 0.4
const STOREY_M = 2.3
const PAGODA = { tier: 2.2, crown: 1.4, maxTiers: 8 }
// Room left above a chimney for its steam to rise under the lot's limit.
const EDO_STEAM_RISE_M = 1.3

// A tiled roof: wide eaves and a ridge, ROOF_M tall.
const roof = (y: number, width: number, depth: number): PartSpec[] => [
  box([0, y + 0.09, 0], [width + 0.7, 0.18, depth + 0.7], ink),
  box([0, y + 0.29, 0], [width * 0.5, 0.22, depth + 0.3], ink)
]

// One box through the body, a little deeper than it, shows as a screen on both faces.
const screens = (y: number, width: number, depth: number, height: number): PartSpec =>
  box([0, y, 0], [width * 0.62, height, depth + 0.08], paper)

function townhouse({ width, depth, height }: Plot): PartSpec[] {
  const w = width - 0.6
  const d = depth - 0.6
  const storeys = clamp(Math.floor((height - ROOF_M) / STOREY_M), [1, 3])
  const storey = Math.min(STOREY_M, (height - ROOF_M) / storeys)
  return [
    box([0, (storeys * storey) / 2, 0], [w, storeys * storey, d], wood),
    ...Array.from({ length: storeys }, (_, index) => [
      screens(index * storey + storey * 0.62, w, d, storey * 0.34),
      ...(index > 0 ? [box([0, index * storey, 0], [w + 0.5, 0.1, d + 0.5], ink)] : [])
    ]).flat(),
    box([0, storey * 0.45, d / 2 + 0.05], [1.2, storey * 0.3, 0.06], lacquer),
    lit(box([w / 2 - 0.5, storey * 0.55, d / 2 + 0.16], [0.25, 0.35, 0.25], glow)),
    ...roof(storeys * storey, w, d)
  ]
}

function storehouse({ width, depth, height }: Plot): PartSpec[] {
  const w = width - 1.2
  const d = depth - 1.2
  const body = Math.min(height - ROOF_M, 4.4)
  return [
    box([0, 0.25, 0], [w + 0.3, 0.5, d + 0.3], ink),
    box([0, body / 2, 0], [w, body, d], paper),
    lit(box([0, body * 0.72, d / 2 + 0.03], [0.5, 0.36, 0.06], glow)),
    box([0, body * 0.26, d / 2 + 0.03], [0.9, body * 0.52, 0.06], lacquer),
    ...roof(body, w, d)
  ]
}

function teaStall({ width, depth, height }: Plot): PartSpec[] {
  const w = width - 1
  const d = depth - 1
  const posts = Math.min(height - ROOF_M, 2.6)
  return [
    box([0, 0.12, 0], [w, 0.24, d], wood),
    ...[-1, 1].flatMap((x) =>
      [-1, 1].map((z) =>
        box([(x * (w - 0.3)) / 2, posts / 2, (z * (d - 0.3)) / 2], [0.18, posts, 0.18], lacquer)
      )
    ),
    box([0, 0.24 + posts * 0.18, -d / 4], [w * 0.6, posts * 0.36, 0.5], paper),
    box([0, posts - 0.3, d / 2 - 0.1], [w * 0.7, 0.4, 0.05], lacquer),
    lit(box([w / 2 - 0.5, posts - 0.45, d / 2 - 0.4], [0.28, 0.38, 0.28], glow)),
    ...roof(posts, w, d)
  ]
}

function shrineGarden({ width, depth, height }: Plot): PartSpec[] {
  const k = Math.min(1, height / 3.2)
  const tree = (x: number, z: number, size: number): PartSpec[] => [
    box([x, 0.85 * k * size, z], [0.22, 1.7 * k * size, 0.22], wood),
    sphere([x, 2.3 * k * size, z], [1.7 * k * size, 1.3 * k * size, 1.7 * k * size], blossom),
    sphere(
      [x + 0.35 * k, 1.9 * k * size, z + 0.2],
      [1.1 * k * size, 0.9 * k * size, 1.1 * k * size],
      blossom
    )
  ]
  const gateZ = depth / 2 - 0.8
  return [
    ...[-0.9, 0.9].map((x) => box([x, 1.2 * k, gateZ], [0.2, 2.4 * k, 0.2], lacquer)),
    box([0, 2.5 * k, gateZ], [2.5, 0.2 * k, 0.25], lacquer),
    box([0, 2.1 * k, gateZ], [2.1, 0.12 * k, 0.16], wood),
    ...tree(-width / 4, -depth / 5, 1),
    ...tree(width / 4, -depth / 4, 0.8),
    box([-width / 4, 0.45 * k, gateZ], [0.16, 0.9 * k, 0.16], ink),
    lit(box([-width / 4, 1.05 * k, gateZ], [0.3, 0.3 * k, 0.3], glow)),
    box([-width / 4, 1.25 * k, gateZ], [0.45, 0.1 * k, 0.45], ink)
  ]
}

function pagoda({ width, depth, height }: Plot): PartSpec[] {
  const tiers = clamp(Math.floor((height - PAGODA.crown) / PAGODA.tier), [1, PAGODA.maxTiers])
  const base = Math.min(width, depth) - 1.4
  const top = tiers * PAGODA.tier
  const sideOf = (tier: number): number => base * (1 - 0.09 * tier)
  return [
    ...Array.from({ length: tiers }, (_, tier) => {
      const side = sideOf(tier)
      const y = tier * PAGODA.tier
      return [
        box([0, y + 0.85, 0], [side, 1.7, side], wood),
        screens(y + 0.95, side, side, 0.6),
        box([0, y + 1.78, 0], [side + 1.3, 0.16, side + 1.3], ink),
        ...(tier > 0 ? [box([0, y + 0.06, 0], [side + 0.5, 0.12, side + 0.5], lacquer)] : [])
      ]
    }).flat(),
    cone([0, top + 0.3, 0], [sideOf(tiers) + 0.6, 1, sideOf(tiers) + 0.6], copper),
    box([0, top + 1.05, 0], [0.12, 0.5, 0.12], lacquer)
  ]
}

// Where the bathhouse chimney ends, in the plot's own metres: its steam starts there.
function edoStackOf({ width, depth, height }: Plot): { x: number; z: number; top: number } {
  const hall = Math.min(height - 2.2, 2.8)
  return {
    x: (width - 0.6) / 2 - 0.8,
    z: -(depth - 0.6) / 2 + 0.8,
    top: Math.min(height - EDO_STEAM_RISE_M, hall + 3.2)
  }
}

function bathhouse(plot: Plot): PartSpec[] {
  const w = plot.width - 0.6
  const d = plot.depth - 0.6
  const hall = Math.min(plot.height - 2.2, 2.8)
  const stack = edoStackOf(plot)
  return [
    box([0, hall / 2, 0], [w, hall, d], wood),
    screens(hall * 0.62, w, d, hall * 0.3),
    box([0, hall * 0.3, d / 2 + 0.05], [1.6, hall * 0.5, 0.06], paper),
    lit(box([-w / 2 + 0.5, hall * 0.6, d / 2 + 0.16], [0.25, 0.35, 0.25], glow)),
    ...roof(hall, w, d),
    // flicker-1: the chimney stops a layer step inside its cap, which steam leaves from.
    box(
      [stack.x, (stack.top - FACADE_LAYER_STEP_M) / 2, stack.z],
      [0.7, stack.top - FACADE_LAYER_STEP_M, 0.7],
      lacquer
    ),
    box([stack.x, stack.top - 0.08, stack.z], [0.9, 0.16, 0.9], ink)
  ]
}

function watchtower({ height }: Plot): PartSpec[] {
  const legs = Math.min(height - 3.2, 14)
  const braces = Math.floor(legs / 2.5)
  return [
    ...[-1.1, 1.1].flatMap((x) =>
      [-1.1, 1.1].map((z) => box([x, legs / 2, z], [0.25, legs, 0.25], lacquer))
    ),
    ...Array.from({ length: braces }, (_, index) => {
      const y = (index + 1) * 2.5 - 0.6
      return [
        ...[-1.1, 1.1].map((z) => box([0, y, z], [2.4, 0.12, 0.12], ink)),
        ...[-1.1, 1.1].map((x) => box([x, y, 0], [0.12, 0.12, 2.4], ink))
      ]
    }).flat(),
    box([0, legs + 0.1, 0], [3.2, 0.2, 3.2], wood),
    box([0, legs + 0.95, 0], [2, 1.5, 2], paper),
    lit(box([0, legs + 1.05, 0], [0.7, 0.5, 2.08], glow)),
    cone([0, legs + 2.3, 0], [3.2, 1.2, 3.2], copper)
  ]
}

export const EDO_BUILDINGS: readonly LotDesign[] = [
  { name: 'townhouse', minHeight: 2, parts: townhouse },
  { name: 'storehouse', minHeight: 2, parts: storehouse },
  { name: 'tea stall', minHeight: 2, parts: teaStall },
  { name: 'shrine garden', minHeight: 2, parts: shrineGarden },
  { name: 'pagoda', minHeight: 3.6, parts: pagoda },
  { name: 'bathhouse', minHeight: 4.5, parts: bathhouse },
  { name: 'watchtower', minHeight: 9, parts: watchtower }
]
