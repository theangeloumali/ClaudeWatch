import type { ReactNode } from 'react'
import type { PartSpec } from '../../themes/parts'
import { directChildren } from '../../themes/scene.test-utils'

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

interface Placement {
  offset: Triple
  scale: Triple
}
interface DrawnProps {
  children?: ReactNode
  position?: Triple
  scale?: Triple | number
  rotation?: Triple
  args?: readonly unknown[]
  color?: string
}
const UNPLACED: Placement = { offset: [0, 0, 0], scale: [1, 1, 1] }
const tripleOf = (value: Triple | number | undefined, fallback: number): Triple =>
  typeof value === 'number' ? [value, value, value] : (value ?? [fallback, fallback, fallback])
const times = (a: Triple, b: Triple): Triple => [a[0] * b[0], a[1] * b[1], a[2] * b[2]]

// The unturned boxes a JSX scene draws, placed through its groups' positions and scales.
export function drawnBoxes(node: ReactNode, label: string, placement = UNPLACED): WorldBox[] {
  return directChildren(node).flatMap((element, index) => {
    const props: DrawnProps = element.props
    if (props.rotation?.some((angle) => angle !== 0)) return []
    const centre = times(placement.scale, tripleOf(props.position, 0))
    const here: Placement = {
      offset: [0, 1, 2].map((axis) => placement.offset[axis] + centre[axis]) as Triple,
      scale: times(placement.scale, tripleOf(props.scale, 1))
    }
    if (element.type !== 'mesh') return drawnBoxes(props.children, label, here)
    const parts = directChildren(props.children)
    const geometry = parts.find((part) => part.type === 'boxGeometry')
    const material = parts.find((part) => String(part.type).endsWith('Material'))
    const materialProps: DrawnProps | undefined = material?.props
    if (!geometry || typeof materialProps?.color !== 'string') return []
    const args: DrawnProps['args'] = geometry.props.args ?? [1, 1, 1]
    const unit = args.map((value) => (typeof value === 'number' ? value : 1)) as Triple
    return [boxOf(`${label}#${index}`, materialProps.color, here.offset, times(here.scale, unit))]
  })
}
