import type { PartSpec } from '../../themes/parts'

// flicker-1: boxes whose faces share a plane, point the same way and overlap tie in the depth
// buffer; when their colours differ the tie crawls as the camera moves.
export const PLANE_EPSILON_M = 1e-6
export type Triple = [number, number, number]

export interface WorldBox {
  label: string
  color: string
  min: Triple
  max: Triple
}

export function boxOf(label: string, color: string, centre: Triple, size: Triple): WorldBox {
  return {
    label,
    color,
    min: [centre[0] - size[0] / 2, centre[1] - size[1] / 2, centre[2] - size[2] / 2],
    max: [centre[0] + size[0] / 2, centre[1] + size[1] / 2, centre[2] + size[2] / 2]
  }
}

export function partBoxes(prefix: string, parts: readonly PartSpec[], origin: Triple): WorldBox[] {
  return parts.flatMap((part, index) =>
    part.shape === 'box' && !part.rotation
      ? [
          boxOf(
            `${prefix}:h${part.size[1].toFixed(2)}#${index}`,
            part.color,
            [origin[0] + part.at[0], origin[1] + part.at[1], origin[2] + part.at[2]],
            part.size
          )
        ]
      : []
  )
}

function overlap(a: WorldBox, b: WorldBox, axis: number): number {
  return Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis])
}

// A shared face rectangle is hidden when a third box covers it from the facing side.
function isBuried(
  boxes: readonly WorldBox[],
  pair: readonly WorldBox[],
  axis: number,
  side: 'min' | 'max',
  plane: number,
  rect: { min: Triple; max: Triple }
): boolean {
  const others = [0, 1, 2].filter((other) => other !== axis)
  return boxes.some((cover) => {
    if (pair.includes(cover)) return false
    const covers = others.every(
      (other) =>
        cover.min[other] <= rect.min[other] + PLANE_EPSILON_M &&
        cover.max[other] >= rect.max[other] - PLANE_EPSILON_M
    )
    return side === 'max'
      ? covers &&
          cover.min[axis] <= plane + PLANE_EPSILON_M &&
          cover.max[axis] > plane + PLANE_EPSILON_M
      : covers &&
          cover.max[axis] >= plane - PLANE_EPSILON_M &&
          cover.min[axis] < plane - PLANE_EPSILON_M
  })
}

// Same plane, same outward normal, positive shared area, different colours, and visible. The
// camera never looks up (MAX_POLAR is 70°), so bottom faces are skipped.
export function coplanarConflicts(boxes: readonly WorldBox[]): string[] {
  const conflicts: string[] = []
  for (let i = 0; i < boxes.length; i += 1)
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]
      const b = boxes[j]
      if (a.color === b.color) continue
      for (let axis = 0; axis < 3; axis += 1) {
        const others = [0, 1, 2].filter((other) => other !== axis)
        if (!others.every((other) => overlap(a, b, other) > PLANE_EPSILON_M)) continue
        for (const side of ['min', 'max'] as const) {
          if (axis === 1 && side === 'min') continue
          const plane = a[side][axis]
          if (Math.abs(plane - b[side][axis]) >= PLANE_EPSILON_M) continue
          const rect = {
            min: [0, 1, 2].map((k) => Math.max(a.min[k], b.min[k])) as Triple,
            max: [0, 1, 2].map((k) => Math.min(a.max[k], b.max[k])) as Triple
          }
          if (isBuried(boxes, [a, b], axis, side, plane, rect)) continue
          conflicts.push(`${a.label} ~ ${b.label} @ ${side}-${'xyz'[axis]}=${plane.toFixed(3)}`)
        }
      }
    }
  return conflicts
}

export function kindsOf(conflicts: readonly string[]): string {
  const kinds = new Set(
    conflicts.map((line) =>
      line
        .replace(/#\d+/g, '')
        .replace(/:(north|south|east|west)/g, '')
        .replace(/=.*$/, '')
    )
  )
  return [...kinds].sort().join('\n')
}
