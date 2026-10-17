import { describe, expect, it } from 'vitest'
import type { LoungeGeometry } from '../scene-model'
import { loungeAsDrawn } from '../scene/FloorView'
import { gameCornerParts, planGameCorner } from './game-corner'
import { gameCornerFixture, HEADINGS } from './game-corner.test-utils'
import { overlaps } from './lot-math'
import { BRASS } from './palettes'
import type { PartSpec } from './parts'
import { listThemes } from './registry'

const SEAT_TOP_M = 0.3
const EPSILON = 1e-6

const topOf = (part: PartSpec): number => part.at[1] + part.size[1] / 2
const bottomOf = (part: PartSpec): number => part.at[1] - part.size[1] / 2

function gap(part: PartSpec, x: number, z: number): number {
  const dx = Math.max(0, Math.abs(x - part.at[0]) - part.size[0] / 2)
  const dz = Math.max(0, Math.abs(z - part.at[2]) - part.size[2] / 2)
  return Math.hypot(dx, dz)
}

// Points an agent's body passes: its seat, and the straight walk there from the door.
function walked(corner: LoungeGeometry): { x: number; z: number }[] {
  return corner.seats.flatMap((seat) =>
    Array.from({ length: 41 }, (_, step) => ({
      x: corner.door.x + ((seat.x - corner.door.x) * step) / 40,
      z: corner.door.z + ((seat.z - corner.door.z) * step) / 40
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
      for (const part of standing) expect(gap(part, point.x, point.z)).toBeGreaterThan(0.4)
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
    const lit = parts.filter((part) => part.glow)
    const panel = lit.reduce((wide, part) =>
      part.size[wideAxis] > wide.size[wideAxis] ? part : wide
    )
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

  it('stands two arcade cabinets apart from the screen, each tall with a glowing screen', () => {
    const plan = planGameCorner(corner)
    expect(plan.cabinets).toHaveLength(2)
    const [first, second] = plan.cabinets
    expect(overlaps(first, second)).toBe(false)
    for (const cabinet of plan.cabinets) {
      expect(overlaps(cabinet, plan.screen)).toBe(false)
      const within = parts.filter(
        (part) =>
          Math.abs(part.at[0] - cabinet.x) <= cabinet.width / 2 + EPSILON &&
          Math.abs(part.at[2] - cabinet.z) <= cabinet.depth / 2 + EPSILON
      )
      expect(within.some((part) => topOf(part) > 1.3)).toBe(true)
      expect(within.some((part) => part.glow)).toBe(true)
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
  expect(planGameCorner(narrow).cabinets).toEqual([])
})

it('paints every part from the theme palette, in every theme', () => {
  const corner = loungeAsDrawn(gameCornerFixture(Math.PI, 8))
  for (const theme of listThemes()) {
    const colours = new Set(Object.values(theme.palette))
    for (const part of gameCornerParts(corner, theme.palette))
      expect(colours.has(part.color), `${theme.id} ${part.color}`).toBe(true)
  }
})
