import {
  BoxGeometry,
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  SphereGeometry,
  type BufferGeometry
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CITIZEN_SCALE } from '../../../shared/office/figure-scale'

export interface FigurePart {
  geometry: BufferGeometry
  color: string
}

// One kind of townsperson or animal. It faces +z and stands on y = 0.
export interface CitizenFigure {
  name: string
  parts: () => FigurePart[]
}

type Triple = readonly [number, number, number]

// Few sides: a citizen is a few pixels tall at the floor's default zoom.
const SIDES = 7
export const SKIN = '#D9A887'

export const box = (color: string, size: Triple, at: Triple): FigurePart => ({
  geometry: new BoxGeometry(...size).translate(...at),
  color
})

// [top radius, bottom radius, height]
export const tube = (color: string, size: Triple, at: Triple): FigurePart => ({
  geometry: new CylinderGeometry(size[0], size[1], size[2], SIDES).translate(...at),
  color
})

export const cone = (color: string, radius: number, height: number, at: Triple): FigurePart => ({
  geometry: new ConeGeometry(radius, height, SIDES).translate(...at),
  color
})

export const ball = (color: string, radius: number, at: Triple): FigurePart => ({
  geometry: new SphereGeometry(radius, SIDES, 5).translate(...at),
  color
})

// A wheel on an axle across the figure: a cylinder stands along y, so it is laid over first.
export function wheel(
  color: string,
  radius: number,
  width: number,
  at: Triple,
  sides = SIDES
): FigurePart {
  const geometry = new CylinderGeometry(radius, radius, width, sides)
  return { geometry: geometry.rotateZ(Math.PI / 2).translate(...at), color }
}

// A person on foot: robe, coat, head and hair.
export function person(dress: { robe: string; coat: string; hair: string }): FigurePart[] {
  return [
    tube(dress.robe, [0.12, 0.19, 0.5], [0, 0.25, 0]),
    tube(dress.coat, [0.15, 0.13, 0.3], [0, 0.64, 0]),
    ball(SKIN, 0.11, [0, 0.9, 0]),
    tube(dress.hair, [0.09, 0.115, 0.06], [0, 0.98, 0])
  ]
}

interface Build {
  coat: string
  // Nose to tail, across the back, and the length of a leg.
  length: number
  girth: number
  leg: number
  head: number
}

// A four-legged animal: legs, a body and a head held out ahead of it.
export function quadruped({ coat, length, girth, leg, head }: Build): FigurePart[] {
  const across = girth / 3
  const along = length / 2.6
  return [
    ...[-1, 1].flatMap((side) =>
      [-1, 1].map((end) => box(coat, [0.05, leg, 0.05], [side * across, leg / 2, end * along]))
    ),
    box(coat, [girth, girth, length], [0, leg + girth / 2, 0]),
    ball(coat, head, [0, leg + girth + head * 0.5, length / 2 + head * 0.4])
  ]
}

// Every part in one buffer, coloured per vertex, at the size it was authored.
export function mergeParts(name: string, figureParts: readonly FigurePart[]): BufferGeometry {
  const parts = figureParts.map(({ geometry, color }) => {
    const count = geometry.getAttribute('position').count
    const colors = new Float32Array(count * 3)
    const tint = new Color(color)
    for (let vertex = 0; vertex < count; vertex++) tint.toArray(colors, vertex * 3)
    return geometry.setAttribute('color', new BufferAttribute(colors, 3))
  })
  // Extruded parts carry no index while boxes do, and a mixed merge fails: flatten them alike.
  const isMixed = parts.some((part) => part.index === null) && parts.some((part) => part.index)
  const alike = isMixed ? parts.map((part) => (part.index ? part.toNonIndexed() : part)) : parts
  const merged = mergeGeometries(alike)
  for (const part of new Set([...parts, ...alike])) part.dispose()
  if (!merged) throw new Error(`The parts of ${name} do not merge`)
  return merged
}

// All the citizens of one kind cost one draw.
export function citizenGeometry(figure: CitizenFigure): BufferGeometry {
  return mergeParts(figure.name, figure.parts()).scale(CITIZEN_SCALE, CITIZEN_SCALE, CITIZEN_SCALE)
}
