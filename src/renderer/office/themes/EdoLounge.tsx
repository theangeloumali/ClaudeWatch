import { FACADE_LAYER_STEP_M } from '../scene/building-window-parts'
import { useMemo } from 'react'
import type { LoungeGeometry } from '../scene-model'
import { firstClear, spotAt, type Footprint } from './lounge-layout'
import { EDO } from './palettes'
import { box, Parts, type PartSpec } from './parts'
import type { LoungeProps } from './types'

// Lacquer and paper are the fence and wall colours the floor already draws, so they cost nothing.
const { wood, paper, lacquer } = EDO
const TABLE = { length: 1.5, reach: 0.8 }
const LANTERN_M = 0.4
const SCREEN = { length: 1.4, reach: 0.12 }

const WALLS: readonly [number, number][] = [
  [0, 1],
  [-1, 1],
  [1, 1],
  [0, -1],
  [-1, -1],
  [1, -1]
]
const CORNERS: readonly [number, number][] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1]
]

// A low table with a board game laid out and a teapot beside it.
function gameTable({ x, z, width, depth }: Footprint): PartSpec[] {
  return [
    box([x, 0.36, z], [width, 0.08, depth], wood),
    ...[-1, 1].flatMap((dx) =>
      [-1, 1].map((dz) =>
        box([x + dx * (width / 2 - 0.1), 0.16, z + dz * (depth / 2 - 0.1)], [0.1, 0.32, 0.1], wood)
      )
    ),
    box([x - 0.25, 0.415, z], [0.5, 0.03, 0.5], paper),
    box([x - 0.35, 0.445, z - 0.1], [0.08, 0.03, 0.08], lacquer),
    box([x - 0.15, 0.445, z + 0.1], [0.08, 0.03, 0.08], lacquer),
    box([x + 0.45, 0.47, z], [0.18, 0.14, 0.18], paper)
  ]
}

function floorLantern({ x, z }: Footprint): PartSpec[] {
  return [
    box([x, 0.04, z], [0.36, 0.08, 0.36], wood),
    box([x, 0.6, z], [0.08, 1.2, 0.08], lacquer),
    box([x, 1.32, z], [0.34, 0.42, 0.34], paper),
    box([x, 1.56, z], [LANTERN_M, 0.06, LANTERN_M], lacquer)
  ]
}

function screenPanel({ x, z, width, depth }: Footprint): PartSpec[] {
  return [
    box([x, 0.6, z], [width, 1.1, depth * 0.4], paper),
    // flicker-1: rail and sill overhang the screen a step so their ends never share its plane.
    box([x, 1.18, z], [width + 2 * FACADE_LAYER_STEP_M, 0.07, depth], lacquer),
    box([x, 0.04, z], [width + 2 * FACADE_LAYER_STEP_M, 0.08, depth], lacquer)
  ]
}

// A tea-house deck: a cushion at every seat, with a game table, a lantern and folding screens
// wherever no agent sits or walks in from the door.
export function edoLoungeParts(lounge: LoungeGeometry): PartSpec[] {
  const table = firstClear(
    lounge,
    WALLS.map(([across, along]) => spotAt(lounge, across, along, TABLE.length, TABLE.reach))
  )
  const taken = table ? [table] : []
  const lantern = firstClear(
    lounge,
    CORNERS.map(([across, along]) => spotAt(lounge, across, along, LANTERN_M, LANTERN_M)),
    taken
  )
  if (lantern) taken.push(lantern)
  const screens = [-0.62, 0.62].flatMap((across) => {
    const spot = firstClear(
      lounge,
      [-1, 1].map((along) => spotAt(lounge, across, along, SCREEN.length, SCREEN.reach)),
      taken
    )
    return spot ? [spot] : []
  })
  return [
    box([lounge.x, 0.015, lounge.z], [lounge.width, 0.03, lounge.depth], wood),
    ...lounge.seats.flatMap((seat) => [
      box([seat.x, 0.08, seat.z], [0.62, 0.1, 0.62], lacquer),
      box([seat.x, 0.14, seat.z], [0.4, 0.03, 0.4], paper)
    ]),
    ...(table ? gameTable(table) : []),
    ...(lantern ? floorLantern(lantern) : []),
    ...screens.flatMap(screenPanel)
  ]
}

export function EdoLounge({ lounge }: LoungeProps) {
  const parts = useMemo(() => edoLoungeParts(lounge), [lounge])
  return <Parts parts={parts} />
}
