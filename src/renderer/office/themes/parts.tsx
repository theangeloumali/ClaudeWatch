import type { Vector } from './primitives'
import { UnitPart, type UnitShape } from './unit-parts'

// A figure as data: unit shapes scaled per part, so a whole cast shares a few merged draws.
export interface PartSpec {
  shape: UnitShape
  at: Vector
  size: Vector
  color: string
  rotation?: Vector
  glow?: boolean
}

export const box = (at: Vector, size: Vector, color: string): PartSpec => ({
  shape: 'box',
  at,
  size,
  color
})

// The highest point any part reaches.
export const topOf = (parts: readonly PartSpec[]): number =>
  Math.max(...parts.map((part) => part.at[1] + part.size[1] / 2))

const shaped =
  (shape: UnitShape) =>
  (at: Vector, size: Vector, color: string): PartSpec => ({ shape, at, size, color })

// Each is one unit across before `size`: a cylinder or cone stands along y, `size` is its box.
export const cylinder = shaped('cylinder')
export const cone = shaped('cone')
export const sphere = shaped('sphere')

export const turned = (part: PartSpec, rotation: Vector): PartSpec => ({ ...part, rotation })

export const lit = (part: PartSpec): PartSpec => ({ ...part, glow: true })

// Mirrors a part across the figure's centre line.
export const SIDES = [-1, 1] as const
export const CORNERS = SIDES.flatMap((x) => SIDES.map((z) => ({ x, z })))

export function Parts({ parts }: { parts: readonly PartSpec[] }) {
  return (
    <>
      {parts.map((part, index) => (
        <UnitPart key={index} {...part} />
      ))}
    </>
  )
}
