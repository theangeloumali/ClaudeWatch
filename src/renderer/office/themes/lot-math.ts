// dry-new: the seeded draws live in shared so the sim, a node-side module, can use them too.
export { between, draw, hashOf } from '../../../shared/office/seeded-draw'

export interface Rect {
  x: number
  z: number
  width: number
  depth: number
}

export function rectOf(west: number, east: number, north: number, south: number): Rect {
  return { x: (west + east) / 2, z: (north + south) / 2, width: east - west, depth: south - north }
}

export function gapBetween(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.abs(a.x - b.x) - (a.width + b.width) / 2)
  const dz = Math.max(0, Math.abs(a.z - b.z) - (a.depth + b.depth) / 2)
  return Math.hypot(dx, dz)
}

export function overlaps(a: Rect, b: Rect): boolean {
  return (
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.z - b.z) < (a.depth + b.depth) / 2
  )
}

export function contains(outer: Rect, inner: Rect): boolean {
  return (
    Math.abs(inner.x - outer.x) + inner.width / 2 <= outer.width / 2 &&
    Math.abs(inner.z - outer.z) + inner.depth / 2 <= outer.depth / 2
  )
}

export function grow(rect: Rect, metres: number): Rect {
  return { ...rect, width: rect.width + metres * 2, depth: rect.depth + metres * 2 }
}
