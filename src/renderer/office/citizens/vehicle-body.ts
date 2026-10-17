import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, MathUtils, Shape, Vector2 } from 'three'
import type { FigurePart } from './figure-parts'

// dry-new: figure-parts builds from boxes and tubes; a car body needs an extruded silhouette.
// Ported from ClearSpent scene/car-parts.ts and car-body.ts (e2903bed).

// A side silhouette, z tail (−) to nose (+), y up, in ClearSpent's own metres.
interface CarProfile {
  length: number
  width: number
  wheelRadius: number
  axles: readonly [rear: number, front: number]
  clearance: number
  nose: number
  tail: number
  belt: number
  roof: number
  // Windshield base and top, rear glass top and base, on z.
  glass: readonly [base: number, top: number, rearTop: number, rearBase: number]
  cabin?: number
  roofBand?: number
  pillars?: readonly number[]
}

// A theme's colours for one vehicle.
export interface VehicleDress {
  paint: string
  glass: string
  trim: string
  tyre: string
  rim: string
  headlight: string
  taillight: string
}

type Point = readonly [z: number, y: number]
type Triple = readonly [number, number, number]

// ClearSpent's lean build: no bevels and few curve steps, which read the same at CW's zoom and
// keep a full fleet inside the scene's triangle ceiling.
const CURVE_STEPS = 3
const WHEEL_SIDES = 8
const CORNER_M = 0.12

const part = (geometry: FigurePart['geometry'], color: string): FigurePart => ({ geometry, color })
const block = (color: string, size: Triple, at: Triple): FigurePart =>
  part(new BoxGeometry(...size).translate(...at), color)
const polygon = (points: readonly Point[]): Shape =>
  new Shape(points.map(([z, y]) => new Vector2(z, y)))

// A side silhouette extruded across `width`, centred on x.
function extrude(shape: Shape, width: number, color: string, x = 0): FigurePart {
  const geometry = new ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: false,
    curveSegments: CURVE_STEPS
  })
  geometry.rotateY(-Math.PI / 2).translate(x + width / 2, 0, 0)
  return part(geometry, color)
}

function wheels(p: CarProfile, dress: VehicleDress): FigurePart[] {
  const disc = (radius: number, width: number, at: Triple) =>
    new CylinderGeometry(radius, radius, width, WHEEL_SIDES).rotateZ(Math.PI / 2).translate(...at)
  return p.axles.flatMap((z) =>
    [-1, 1].flatMap((side) => {
      const at: Triple = [side * (p.width / 2 - 0.1), p.wheelRadius, z]
      return [
        part(disc(p.wheelRadius, 0.22, at), dress.tyre),
        part(disc(p.wheelRadius * 0.58, 0.24, at), dress.rim)
      ]
    })
  )
}

// A wheel arch cut into the underbody, a little larger than the tyre.
function arch(shape: Shape, axle: number, radius: number, floor: number): void {
  const opening = radius + 0.07
  const meet = Math.asin(MathUtils.clamp((floor - radius) / opening, -1, 1))
  shape.lineTo(axle - opening * Math.cos(meet), floor)
  shape.absarc(axle, radius, opening, Math.PI - meet, meet, true)
}

function bodyShape(p: CarProfile): Shape {
  const half = p.length / 2
  const [base, , , rearBase] = p.glass
  const shape = new Shape().moveTo(-half + CORNER_M, p.clearance)
  for (const axle of p.axles) arch(shape, axle, p.wheelRadius, p.clearance)
  shape.lineTo(half - CORNER_M, p.clearance)
  shape.quadraticCurveTo(half, p.clearance, half, p.clearance + CORNER_M)
  shape.lineTo(half, p.nose - 0.1)
  shape.quadraticCurveTo(half, p.nose, half - 0.18, p.nose)
  const top: Point[] = [
    [base, p.belt],
    [rearBase, p.belt],
    [-half + 0.18, p.tail]
  ]
  for (const [z, y] of top.sort((a, b) => b[0] - a[0])) shape.lineTo(z, y)
  shape.quadraticCurveTo(-half, p.tail, -half, p.tail - 0.1)
  shape.lineTo(-half, p.clearance + CORNER_M)
  shape.quadraticCurveTo(-half, p.clearance, -half + CORNER_M, p.clearance)
  return shape
}

function cabinShape(p: CarProfile): Shape {
  const [base, top, rearTop, rearBase] = p.glass
  const low = p.belt - 0.02
  return new Shape()
    .moveTo(base, low)
    .lineTo(MathUtils.lerp(base, top, 0.8), MathUtils.lerp(low, p.roof, 0.8))
    .quadraticCurveTo(top, p.roof, top - 0.14, p.roof)
    .lineTo(rearTop + 0.14, p.roof)
    .quadraticCurveTo(
      rearTop,
      p.roof,
      MathUtils.lerp(rearTop, rearBase, 0.2),
      MathUtils.lerp(p.roof, low, 0.2)
    )
    .lineTo(rearBase, low)
    .closePath()
}

// Body, wheels, lights and bumpers.
function carBody(p: CarProfile, dress: VehicleDress): FigurePart[] {
  const half = p.length / 2
  const lamp = p.width / 2 - 0.2
  return [
    extrude(bodyShape(p), p.width, dress.paint),
    ...wheels(p, dress),
    ...[-1, 1].flatMap((side) => [
      block(dress.headlight, [0.22, 0.08, 0.04], [side * lamp, p.nose - 0.12, half]),
      block(dress.taillight, [0.2, 0.09, 0.04], [side * lamp, p.tail - 0.12, -half])
    ]),
    ...[half - 0.02, -half + 0.02].map((z) =>
      block(dress.trim, [p.width - 0.04, 0.1, 0.08], [0, p.clearance + 0.08, z])
    )
  ]
}

// A glass cabin under a roof, with pillars in the trim colour.
function greenhouse(p: CarProfile, dress: VehicleDress): FigurePart[] {
  const [, top, rearTop] = p.glass
  const cabin = p.width * (p.cabin ?? 0.86)
  const band = p.roofBand ?? 0.05
  const roof = polygon([
    [top - 0.1, p.roof + 0.04],
    [rearTop + 0.1, p.roof + 0.04],
    [rearTop + 0.06, p.roof - band],
    [top - 0.06, p.roof - band]
  ])
  return [
    extrude(cabinShape(p), cabin, dress.glass),
    extrude(roof, cabin + 0.03, dress.trim),
    ...(p.pillars ?? [(top + rearTop) / 2]).map((z) =>
      block(dress.trim, [cabin + 0.03, p.roof - p.belt, 0.09], [0, (p.roof + p.belt) / 2, z])
    )
  ]
}

const BUS: CarProfile = {
  length: 5.0,
  width: 1.5,
  wheelRadius: 0.3,
  axles: [-1.4, 1.5],
  clearance: 0.3,
  nose: 1.0,
  tail: 1.25,
  belt: 1.25,
  roof: 2.0,
  glass: [1.7, 1.62, -2.26, -2.3],
  cabin: 0.98,
  roofBand: 0.2,
  pillars: [1.1, 0.55, 0, -0.55, -1.1, -1.65]
}
const MINIVAN: CarProfile = {
  length: 3.1,
  width: 1.2,
  wheelRadius: 0.22,
  axles: [-1.0, 1.0],
  clearance: 0.19,
  nose: 0.64,
  tail: 0.82,
  belt: 0.82,
  roof: 1.36,
  glass: [0.95, 0.32, -1.25, -1.35],
  pillars: [-0.1, -0.75]
}
const HATCHBACK: CarProfile = {
  length: 2.5,
  width: 1.12,
  wheelRadius: 0.2,
  axles: [-0.8, 0.82],
  clearance: 0.16,
  nose: 0.56,
  tail: 0.66,
  belt: 0.66,
  roof: 1.03,
  glass: [0.5, 0.02, -0.92, -1.05]
}

export const VEHICLE_BODIES = { bus: BUS, van: MINIVAN, hatchback: HATCHBACK } as const

// One extruded vehicle, built at ClearSpent's size and scaled whole to `length`, so its fixed
// lamps and bumpers keep their proportions. A van carries a cargo box behind its cab.
export function extrudedVehicle(
  body: keyof typeof VEHICLE_BODIES,
  dress: VehicleDress & { cargo?: string },
  length: number
): FigurePart[] {
  const p = VEHICLE_BODIES[body]
  const parts = [...carBody(p, dress), ...greenhouse(p, dress)]
  if (dress.cargo)
    parts.push(block(dress.cargo, [p.width * 0.96, 0.62, 1.5], [0, p.roof + 0.05, -0.62]))
  const scale = length / p.length
  for (const { geometry } of parts) geometry.scale(scale, scale, scale)
  return parts
}
