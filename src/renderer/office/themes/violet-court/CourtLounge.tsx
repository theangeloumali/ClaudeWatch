import { FACADE_LAYER_STEP_M } from '../../scene/building-window-parts'
import { useMemo } from 'react'
import type { LoungeGeometry } from '../../scene-model'
import { box, lit, Parts, SIDES, type PartSpec } from '../parts'
import type { LoungeProps } from '../types'
import { COURT } from './palette'

// A cushioned stool with a low back: low enough that the pilot on it still shows from the front.
const SEAT: PartSpec[] = [
  box([0, 0.15, -0.1], [0.46, 0.3, 0.4], COURT.violet),
  box([0, 0.31, -0.1], [0.5, 0.03, 0.44], COURT.gold),
  box([0, 0.42, -0.33], [0.5 - 2 * FACADE_LAYER_STEP_M, 0.5, 0.06], COURT.ink),
  box([0, 0.69, -0.33], [0.56, 0.05, 0.08], COURT.gold)
]

const BOARD = { squares: 4, square: 0.32, y: 0.11 }
// Column, row and whether it is a dark piece; the tall ones wear a gold crown.
const PIECES: readonly [number, number, boolean, boolean][] = [
  [0, 0, true, false],
  [1, 0, true, true],
  [3, 1, true, false],
  [0, 2, false, false],
  [2, 3, false, true],
  [3, 3, false, false]
]

// A chessboard the height of a table top's thickness, with a game left half played.
function chessTerrace(x: number, z: number): PartSpec[] {
  const squareAt = (index: number): number => (index - (BOARD.squares - 1) / 2) * BOARD.square
  const squares = Array.from({ length: BOARD.squares * BOARD.squares }, (_, index) => {
    const column = index % BOARD.squares
    const row = Math.floor(index / BOARD.squares)
    return box(
      [x + squareAt(column), BOARD.y, z + squareAt(row)],
      [BOARD.square, 0.04, BOARD.square],
      (column + row) % 2 ? COURT.slate : COURT.marble
    )
  })
  const pieces = PIECES.flatMap(([column, row, isDark, isCrowned]) => {
    const at = { x: x + squareAt(column), z: z + squareAt(row) }
    const height = isCrowned ? 0.34 : 0.22
    return [
      box([at.x, 0.13 + height / 2, at.z], [0.14, height, 0.14], isDark ? COURT.ink : COURT.marble),
      ...(isCrowned ? [box([at.x, 0.15 + height, at.z], [0.18, 0.04, 0.18], COURT.gold)] : [])
    ]
  })
  return [...squares, ...pieces]
}

// An open pergola over the board: four posts and gilded beams, with no roof to hide the game.
function pavilion(x: number, z: number): PartSpec[] {
  return [
    ...SIDES.flatMap((side) => [
      ...SIDES.map((end) => box([x + side * 1, 0.9, z + end * 0.9], [0.08, 1.8, 0.08], COURT.ink)),
      box([x + side * 1, 1.8, z], [0.12, 0.1, 2.1], COURT.gold),
      box([x + side * 1, 1.5, z], [0.03, 0.44, 0.5], COURT.violet)
    ]),
    ...SIDES.map((end) => box([x, 1.88, z + end * 0.9], [2.3, 0.08, 0.1], COURT.gold))
  ]
}

// A clipped violet hedge in a stone planter, with a lamp at its near end.
function hedge(x: number, z: number): PartSpec[] {
  return [
    box([x, 0.14, z], [0.5, 0.28, 2], COURT.slate),
    box([x, 0.48, z], [0.4, 0.4, 1.8], COURT.violet),
    box([x, 0.29, z], [0.54, 0.03, 2.04], COURT.gold)
  ]
}

function lampPost(x: number, z: number): PartSpec[] {
  return [
    box([x, 0.75, z], [0.07, 1.5, 0.07], COURT.ink),
    lit(box([x, 1.58, z], [0.2, 0.22, 0.2], COURT.lumen)),
    box([x, 1.71, z], [0.26, 0.04, 0.26], COURT.gold)
  ]
}

const TERRACE = { pastLastRow: 1.75, width: 5.6, depth: 2.3 }
const EDGE_INSET = 0.3

// Everything but the seats, in floor coordinates: past the last row and along the two side edges.
function loungeDecor(lounge: LoungeGeometry): PartSpec[] {
  const lastRow = Math.max(...lounge.seats.map((seat) => seat.z))
  const north = lounge.z - lounge.depth / 2
  const terraceZ = lastRow + TERRACE.pastLastRow
  const edgeX = lounge.width / 2 - EDGE_INSET
  return [
    box([lounge.x, 0.045, terraceZ], [TERRACE.width, 0.07, TERRACE.depth], COURT.slate),
    box([lounge.x, 0.085, terraceZ], [1.6, 0.02, 1.6], COURT.gold),
    ...chessTerrace(lounge.x, terraceZ),
    ...pavilion(lounge.x, terraceZ),
    ...SIDES.flatMap((side) => [
      ...hedge(lounge.x + side * (edgeX - 0.2), terraceZ),
      ...lampPost(lounge.x + side * edgeX, north + 0.4),
      ...lampPost(lounge.x + side * edgeX, lastRow + 0.2)
    ])
  ]
}

// The court's place to rest: stools facing a chess terrace under an open pavilion.
export function CourtLounge({ lounge }: LoungeProps) {
  const decor = useMemo(() => loungeDecor(lounge), [lounge])
  return (
    <group>
      {lounge.seats.map((seat) => (
        <group
          key={seat.slotId}
          name="lounge-seat"
          position={[seat.x, 0, seat.z]}
          rotation={[0, seat.heading, 0]}
        >
          <Parts parts={SEAT} />
        </group>
      ))}
      <group name="lounge-decor">
        <Parts parts={decor} />
      </group>
    </group>
  )
}
