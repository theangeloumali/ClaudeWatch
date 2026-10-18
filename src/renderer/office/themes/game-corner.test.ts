import { describe, expect, it } from 'vitest'
import { NAV_CELL_METRES } from '../../../office/sim/navigation'
import { FURNITURE_SCALE } from '../../../shared/office/figure-scale'
import type { LoungeGeometry } from '../scene-model'
import { gameCornerParts } from './game-corner'
import { gameCornerFixture, HEADINGS } from './game-corner.test-utils'
import { loungeAsDrawn } from './lounge-layout'
import { gapBetween, type Rect } from './lot-math'
import { BRASS } from './palettes'
import { topOf as partsTop, type PartSpec } from './parts'
import { listThemes } from './registry'

const SEAT_TOP_M = 0.3
const CABINET_TOP_M = 1.3
const BAG_M = 0.64
// The sim lets a gamer rounding an outer seat walk half a nav cell past the front row.
const WALKER_REACH = NAV_CELL_METRES / 2 / FURNITURE_SCALE
// A passing robot's radius (layout-geometry.test), so none brushes a cabinet's front.
const ROBOT_CLEAR = 0.3 / FURNITURE_SCALE
const EPSILON = 1e-6

const topOf = (part: PartSpec): number => partsTop([part])
const bottomOf = (part: PartSpec): number => part.at[1] - part.size[1] / 2
const footprintOf = (part: PartSpec): Rect => ({
  x: part.at[0],
  z: part.at[2],
  width: part.size[0],
  depth: part.size[2]
})

// Points an agent's body passes: its seat, and the straight walk there from the door.
function walked(corner: LoungeGeometry): Rect[] {
  return corner.seats.flatMap((seat) =>
    Array.from({ length: 41 }, (_, step) => ({
      x: corner.door.x + ((seat.x - corner.door.x) * step) / 40,
      z: corner.door.z + ((seat.z - corner.door.z) * step) / 40,
      width: 0,
      depth: 0
    }))
  )
}

// The way the seats face, and how far along it a point lies.
function facingOf(corner: LoungeGeometry) {
  const heading = corner.seats[0].heading
  const ahead = { x: Math.sin(heading), z: Math.cos(heading) }
  const along = (x: number, z: number) => x * ahead.x + z * ahead.z
  const beside = (x: number, z: number) => x * ahead.z - z * ahead.x
  const isAlongZ = Math.abs(ahead.z) > 0.5
  return { along, beside, thinAxis: isAlongZ ? 2 : 0, wideAxis: isAlongZ ? 0 : 2 }
}

// How far a part reaches back toward the seats, along the way they face.
function nearEdgeOf(corner: LoungeGeometry, part: PartSpec): number {
  const { along, thinAxis } = facingOf(corner)
  return along(part.at[0], part.at[2]) - part.size[thinAxis] / 2
}

// The widest glowing part: the wall screen's panel.
function panelOf(corner: LoungeGeometry, parts: readonly PartSpec[]): PartSpec {
  const { wideAxis } = facingOf(corner)
  return parts
    .filter((part) => part.glow)
    .reduce((wide, part) => (part.size[wideAxis] > wide.size[wideAxis] ? part : wide))
}

// Tall parts that touch stand as one piece; every piece but the screen's is a cabinet.
function cabinetsOf(corner: LoungeGeometry, parts: readonly PartSpec[]): PartSpec[][] {
  let pieces: PartSpec[][] = []
  for (const part of parts.filter((tall) => topOf(tall) > CABINET_TOP_M)) {
    const isTouching = (piece: PartSpec[]) =>
      piece.some((other) => gapBetween(footprintOf(part), footprintOf(other)) < EPSILON)
    pieces = [
      ...pieces.filter((piece) => !isTouching(piece)),
      [part, ...pieces.filter(isTouching).flat()]
    ]
  }
  const panel = panelOf(corner, parts)
  return pieces.filter((piece) => !piece.includes(panel))
}

const CASES = HEADINGS.flatMap((heading) =>
  [1, 4, 8].map((seatCount) => ({
    name: `${seatCount} seats facing ${heading.toFixed(2)} rad`,
    corner: loungeAsDrawn(gameCornerFixture(heading, seatCount))
  }))
)

describe.each(CASES)('the game corner with $name', ({ corner }) => {
  const parts = gameCornerParts(corner, BRASS)

  it('puts a beanbag low enough to sit on at every seat', () => {
    for (const seat of corner.seats) {
      const cushions = parts.filter(
        (part) =>
          Math.hypot(part.at[0] - seat.x, part.at[2] - seat.z) < 0.05 &&
          topOf(part) > 0.05 &&
          topOf(part) <= SEAT_TOP_M
      )
      expect(cushions.length).toBeGreaterThan(0)
    }
  })

  it('stands nothing taller than a beanbag where an agent sits or walks in from the door', () => {
    const standing = parts.filter((part) => topOf(part) > SEAT_TOP_M)
    expect(standing.length).toBeGreaterThan(0)
    for (const point of walked(corner))
      for (const part of standing) expect(gapBetween(footprintOf(part), point)).toBeGreaterThan(0.4)
  })

  it('keeps every part inside the corner', () => {
    for (const part of parts) {
      expect(Math.abs(part.at[0] - corner.x) + part.size[0] / 2).toBeLessThanOrEqual(
        corner.width / 2 + EPSILON
      )
      expect(Math.abs(part.at[2] - corner.z) + part.size[2] / 2).toBeLessThanOrEqual(
        corner.depth / 2 + EPSILON
      )
    }
  })

  it('hangs a large glowing screen beyond the front row, in a dark frame, facing the seats', () => {
    const { along, beside, thinAxis, wideAxis } = facingOf(corner)
    const frontRow = Math.max(...corner.seats.map((seat) => along(seat.x, seat.z)))
    const seatsMid =
      corner.seats.reduce((sum, seat) => sum + beside(seat.x, seat.z), 0) / corner.seats.length
    const panel = panelOf(corner, parts)
    expect(panel.size[wideAxis]).toBeGreaterThanOrEqual(1.8)
    expect(panel.size[thinAxis]).toBeLessThan(0.1)
    expect(along(panel.at[0], panel.at[2]) - frontRow).toBeGreaterThan(0.5)
    expect(beside(panel.at[0], panel.at[2])).toBeCloseTo(seatsMid, 6)
    // Seated eyes look over the beanbags in front at a panel lifted clear of them.
    expect(bottomOf(panel)).toBeGreaterThan(SEAT_TOP_M)
    const frame = parts.find(
      (part) =>
        part.color === BRASS.ink &&
        topOf(part) > topOf(panel) &&
        part.size[wideAxis] > panel.size[wideAxis] &&
        Math.abs(beside(part.at[0], part.at[2]) - seatsMid) < 1e-6
    )
    expect(frame).toBeDefined()
    if (!frame) return
    expect(along(frame.at[0], frame.at[2])).toBeGreaterThan(along(panel.at[0], panel.at[2]))
  })

  it('stands two tall arcade cabinets clear of the screen and each other, each one glowing', () => {
    const cabinets = cabinetsOf(corner, parts)
    expect(cabinets).toHaveLength(2)
    for (const cabinet of cabinets) expect(cabinet.some((part) => part.glow)).toBe(true)
  })

  // The sim keeps every walker out of the strip between the front row and the far edge.
  it('stands the cabinets in the band beyond the front row, beside the screen, facing the seats', () => {
    const { along, beside } = facingOf(corner)
    const frontRow = Math.max(...corner.seats.map((seat) => along(seat.x, seat.z)))
    const panel = panelOf(corner, parts)
    const panelSide = beside(panel.at[0], panel.at[2])
    for (const cabinet of cabinetsOf(corner, parts)) {
      for (const part of cabinet)
        expect(nearEdgeOf(corner, part)).toBeGreaterThanOrEqual(
          frontRow + WALKER_REACH + ROBOT_CLEAR
        )
      const [body] = cabinet.filter((part) => part.size[1] === 1.5)
      const glow = cabinet.find((part) => part.glow)
      if (!body || !glow) throw new Error('a cabinet has a body and a lit screen')
      expect(along(glow.at[0], glow.at[2])).toBeLessThan(along(body.at[0], body.at[2]))
      const lateral = Math.abs(beside(body.at[0], body.at[2]) - panelSide)
      expect(lateral).toBeGreaterThan(panel.size[facingOf(corner).wideAxis] / 2)
      for (const seat of corner.seats)
        for (const part of cabinet)
          expect(
            gapBetween(footprintOf(part), { x: seat.x, z: seat.z, width: BAG_M, depth: BAG_M })
          ).toBeGreaterThan(0)
    }
  })

  it('draws the same corner on every start', () => {
    expect(gameCornerParts(corner, BRASS)).toEqual(parts)
  })
})

it('leaves the arcade cabinets out of a corner too narrow to walk past them', () => {
  const narrow: LoungeGeometry = {
    id: 'floor-1:games',
    x: 0,
    z: 0,
    width: 2.2,
    depth: 2.6,
    door: { x: 0, z: -1.3 },
    seats: [{ slotId: 'lounge_seat_0', x: 0, z: 0.1, heading: 0 }]
  }
  expect(cabinetsOf(narrow, gameCornerParts(narrow, BRASS))).toEqual([])
})

it('leaves the cabinets out, and the screen whole, where neither fits beside it', () => {
  const slim: LoungeGeometry = {
    id: 'floor-1:games',
    x: 0,
    z: 0,
    width: 3.4,
    depth: 9,
    door: { x: 0, z: -4.5 },
    seats: [{ slotId: 'games_seat_0', x: 0, z: 2.5, heading: 0 }]
  }
  const parts = gameCornerParts(slim, BRASS)
  expect(cabinetsOf(slim, parts)).toEqual([])
  expect(panelOf(slim, parts).size[0]).toBeCloseTo(2 - 0.14)
})

// A wide back row asks for a screen as wide as the corner allows.
const wideBackRow: LoungeGeometry = {
  id: 'floor-1:games',
  x: 0,
  z: 0,
  width: 5,
  depth: 6,
  door: { x: 0, z: -3 },
  seats: [
    { slotId: 'games_seat_0', x: 0, z: 1.8, heading: 0 },
    { slotId: 'games_seat_1', x: -1.875, z: -0.6, heading: 0 },
    { slotId: 'games_seat_2', x: 1.875, z: -0.6, heading: 0 }
  ]
}

it('narrows the screen so two cabinets flank it, where the corner is wide enough', () => {
  const parts = gameCornerParts(wideBackRow, BRASS)
  const cabinets = cabinetsOf(wideBackRow, parts)
  expect(cabinets).toHaveLength(2)
  const panel = panelOf(wideBackRow, parts)
  expect(panel.size[0]).toBeGreaterThanOrEqual(1.8)
  expect(panel.size[0]).toBeLessThan(4.2 - 0.14)
  const screenParts = parts.filter(
    (part) => topOf(part) > CABINET_TOP_M && !cabinets.flat().includes(part)
  )
  for (const part of cabinets.flat())
    for (const screen of screenParts)
      expect(gapBetween(footprintOf(part), footprintOf(screen))).toBeGreaterThan(0.05)
})

it('stands one cabinet on the only side with room beside an off-centre screen', () => {
  // Seats right of centre pull the screen 0.7 m right, too near that side's cabinet spot.
  const offCentre: LoungeGeometry = {
    ...wideBackRow,
    seats: [
      { slotId: 'games_seat_0', x: 1, z: 1.8, heading: 0 },
      { slotId: 'games_seat_1', x: -0.4, z: -0.6, heading: 0 },
      { slotId: 'games_seat_2', x: 2.4, z: -0.6, heading: 0 }
    ]
  }
  const parts = gameCornerParts(offCentre, BRASS)
  const cabinets = cabinetsOf(offCentre, parts)
  expect(cabinets).toHaveLength(1)
  expect(cabinets[0][0].at[0]).toBeLessThan(0)
  expect(panelOf(offCentre, parts).size[0]).toBeCloseTo(2.8 + 0.8 - 0.14)
})

it('paints every part from the theme palette, in every theme', () => {
  const corner = loungeAsDrawn(gameCornerFixture(Math.PI, 8))
  for (const theme of listThemes()) {
    const colours = new Set(Object.values(theme.palette))
    for (const part of gameCornerParts(corner, theme.palette))
      expect(colours.has(part.color), `${theme.id} ${part.color}`).toBe(true)
  }
})
