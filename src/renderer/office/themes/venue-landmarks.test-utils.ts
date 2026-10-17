import type { WorldVenue } from '../../../shared/office/world-document'
import type { PartSpec } from './parts'

const SILHOUETTE_CELL_M = 1

export interface Bounds {
  min: [number, number, number]
  max: [number, number, number]
}

export const boundsOf = (part: PartSpec): Bounds => ({
  min: [0, 1, 2].map((axis) => part.at[axis] - part.size[axis] / 2) as Bounds['min'],
  max: [0, 1, 2].map((axis) => part.at[axis] + part.size[axis] / 2) as Bounds['max']
})

export function enters(part: PartSpec, region: Bounds): boolean {
  const box = boundsOf(part)
  return [0, 1, 2].every(
    (axis) => box.min[axis] < region.max[axis] && box.max[axis] > region.min[axis]
  )
}

// The tallest part over each metre cell of the footprint, as seen from straight above.
export function silhouette(venue: WorldVenue, parts: readonly PartSpec[]): number[] {
  const { width, depth } = venue.footprint
  const boxes = parts.map(boundsOf)
  const cells: number[] = []
  for (let x = -width / 2 + SILHOUETTE_CELL_M / 2; x < width / 2; x += SILHOUETTE_CELL_M)
    for (let z = -depth / 2 + SILHOUETTE_CELL_M / 2; z < depth / 2; z += SILHOUETTE_CELL_M) {
      const over = boxes.filter(
        (box) => box.min[0] <= x && box.max[0] >= x && box.min[2] <= z && box.max[2] >= z
      )
      cells.push(Math.max(0, ...over.map((box) => box.max[1])))
    }
  return cells
}

// The union length of [from, to] spans, clipped to [low, high].
export function covered(spans: readonly [number, number][], low: number, high: number): number {
  const sorted = spans
    .map(([from, to]): [number, number] => [Math.max(low, from), Math.min(high, to)])
    .filter(([from, to]) => to > from)
    .sort((a, b) => a[0] - b[0])
  let length = 0
  let reach = low
  for (const [from, to] of sorted) {
    length += Math.max(0, to - Math.max(from, reach))
    reach = Math.max(reach, to)
  }
  return length
}
