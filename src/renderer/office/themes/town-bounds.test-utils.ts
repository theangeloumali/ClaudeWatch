import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { expect } from 'vitest'
import type { CitizenFigure } from '../citizens/figure-parts'
import type { ZoneDesign, ZonePlot } from '../town/town-dress'
import type { PartSpec } from './parts'
import { UNIT_SHAPES } from './unit-parts'

export const EPSILON = 1e-6
export const TEST_ACCENT = '#12AB34'
export const HEX = /^#[0-9A-F]{6}$/i
// A design may float or bed a mound this far off the ground and still stand on it.
export const GROUND_SLACK_M = 0.05

// The box a part fills, with its own rotation applied.
export function boundsOf(part: PartSpec): Box3 {
  const matrix = new Matrix4().compose(
    new Vector3(...part.at),
    new Quaternion().setFromEuler(new Euler(...(part.rotation ?? [0, 0, 0]))),
    new Vector3(...part.size)
  )
  return new Box3(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5)).applyMatrix4(matrix)
}

// The box a figure fills as it is modelled, before the citizens' scale.
export function sizeOf(figure: CitizenFigure): Box3 {
  return figure.parts().reduce((all, { geometry }) => {
    geometry.computeBoundingBox()
    const box = geometry.boundingBox
    geometry.dispose()
    return box ? all.union(box) : all
  }, new Box3())
}

export function heightOf(figure: CitizenFigure): number {
  return sizeOf(figure).max.y
}

export function expectOnItsPlot(design: ZoneDesign, plot: ZonePlot): void {
  const parts = design.build(plot)
  const bounds = parts.reduce((all, part) => all.union(boundsOf(part)), new Box3())
  const at = `${design.name} on ${plot.width}x${plot.depth}x${plot.height}`
  expect(parts.length, at).toBeGreaterThan(0)
  expect(bounds.max.y, `${at} is too tall`).toBeLessThanOrEqual(plot.height + EPSILON)
  expect(bounds.min.y, `${at} is sunk`).toBeGreaterThanOrEqual(-GROUND_SLACK_M - EPSILON)
  expect(bounds.min.y, `${at} floats`).toBeLessThanOrEqual(GROUND_SLACK_M)
  expect(bounds.max.x, `${at} is too wide`).toBeLessThanOrEqual(plot.width / 2 + EPSILON)
  expect(bounds.min.x, `${at} is too wide`).toBeGreaterThanOrEqual(-plot.width / 2 - EPSILON)
  expect(bounds.max.z, `${at} is too deep`).toBeLessThanOrEqual(plot.depth / 2 + EPSILON)
  expect(bounds.min.z, `${at} is too deep`).toBeGreaterThanOrEqual(-plot.depth / 2 - EPSILON)
  for (const part of parts) {
    expect(Object.keys(UNIT_SHAPES), at).toContain(part.shape)
    expect(part.color, at).toMatch(HEX)
    for (const side of part.size) expect(side, `${at} has a flat part`).toBeGreaterThan(0)
  }
}
