import type { FloorLayout } from './layout'
import type { Point } from './path'

// dry-new: bounded floor grids cannot cover streets between buildings; use obstacle corners, not a city bitmap.
type StreetBlock = Pick<FloorLayout, 'x' | 'z' | 'width' | 'depth'>
const STREET_CLEARANCE_M = 0.8
const CORNER_EPSILON_M = 0.01

function crossesBlock(from: Point, to: Point, block: StreetBlock, clearance: number): boolean {
  let first = 0
  let last = 1
  for (const axis of ['x', 'z'] as const) {
    const half = (axis === 'x' ? block.width : block.depth) / 2 + clearance
    const low = block[axis] - half
    const high = block[axis] + half
    const delta = to[axis] - from[axis]
    if (Math.abs(delta) < 1e-8) {
      if (from[axis] <= low || from[axis] >= high) return false
      continue
    }
    const entry = (low - from[axis]) / delta
    const exit = (high - from[axis]) / delta
    first = Math.max(first, Math.min(entry, exit))
    last = Math.min(last, Math.max(entry, exit))
    if (first >= last) return false
  }
  return first < last
}

export function streetPath(options: {
  from: Point
  to: Point
  blocks: readonly StreetBlock[]
  clearance?: number
  orthogonal?: boolean
}): Point[] {
  const { from, to } = options
  const clearance = options.clearance ?? STREET_CLEARANCE_M
  if (![from.x, from.z, to.x, to.z].every(Number.isFinite)) return []
  const blocks = options.blocks.filter(
    (block) =>
      [block.x, block.z, block.width, block.depth].every(Number.isFinite) &&
      block.width > 0 &&
      block.depth > 0
  )
  const isClear = (start: Point, end: Point) =>
    blocks.every((block) => !crossesBlock(start, end, block, clearance))
  const connection = (start: Point, end: Point): Point[] => {
    if (!options.orthogonal || start.x === end.x || start.z === end.z)
      return isClear(start, end) ? [start, end] : []
    for (const elbow of [
      { x: start.x, z: end.z },
      { x: end.x, z: start.z }
    ])
      if (isClear(start, elbow) && isClear(elbow, end)) return [start, elbow, end]
    return []
  }
  const direct = connection(from, to)
  if (direct.length) return direct.map((point) => ({ ...point }))
  const nodes = [
    from,
    to,
    ...blocks.flatMap((block) =>
      [-1, 1].flatMap((side) =>
        [-1, 1].map((edge) => ({
          x: block.x + side * (block.width / 2 + clearance + CORNER_EPSILON_M),
          z: block.z + edge * (block.depth / 2 + clearance + CORNER_EPSILON_M)
        }))
      )
    )
  ]
  const distances = nodes.map(() => Number.POSITIVE_INFINITY)
  const previous = nodes.map(() => -1)
  const visited = new Set<number>()
  distances[0] = 0
  while (visited.size < nodes.length) {
    let nearest = -1
    for (const index of nodes.keys())
      if (!visited.has(index) && (nearest < 0 || distances[index] < distances[nearest]))
        nearest = index
    if (nearest < 0 || !Number.isFinite(distances[nearest])) return []
    if (nearest === 1) break
    visited.add(nearest)
    for (const index of nodes.keys()) {
      if (visited.has(index) || !connection(nodes[nearest], nodes[index]).length) continue
      const distance =
        distances[nearest] +
        (options.orthogonal
          ? Math.abs(nodes[index].x - nodes[nearest].x) +
            Math.abs(nodes[index].z - nodes[nearest].z)
          : Math.hypot(nodes[index].x - nodes[nearest].x, nodes[index].z - nodes[nearest].z))
      if (distance >= distances[index]) continue
      distances[index] = distance
      previous[index] = nearest
    }
  }
  const route: Point[] = []
  for (let index = 1; previous[index] >= 0; index = previous[index])
    route.unshift(...connection(nodes[previous[index]], nodes[index]).slice(1))
  route.unshift({ ...from })
  return route
}
