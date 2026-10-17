import { isValidElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { session } from '../../../office/sim/fixtures'
import { buildLayout } from '../../../office/sim/layout'
import { FURNITURE_SCALE, GUEST_FURNITURE_SCALE } from '../../../shared/office/figure-scale'
import { toFloorGeometry } from '../../office-live/layout-geometry'
import { groupZonesByTheme } from '../logic/office-themes'
import { DESK_REACH } from '../logic/room-layout'
import type { DeskSlot, FloorGeometry, LoungeGeometry } from '../scene-model'
import { gameCornerParts } from '../themes/game-corner'
import { GameCorner } from '../themes/GameCorner'
import { Parts, type PartSpec } from '../themes/parts'
import { themeForTeam } from '../themes/registry'
import { loungeAsDrawn } from '../themes/lounge-layout'
import { FloorView } from './FloorView'

// The views are called as plain functions here, so their one hook is stood in for.
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => object) => factory()
}))

type Seed = [company: string, project: string, sessions: number][]
const ZKIDZ: Seed = [
  ['zkidz', '1', 3],
  ['zkidz', '2', 2],
  ['zkidz', '3', 1],
  ['zkidz', '4', 2]
]
const sessionsOf = (seed: Seed) =>
  seed.flatMap(([company, project, count]) =>
    Array.from({ length: count }, (_, seat) => ({
      ...session(`${company}-${project}-${seat}`, `p_${company}_${project}`),
      companyKey: `c_${company}`,
      companyLabel: company
    }))
  )

interface Found {
  props: Record<string, unknown>
  // Where the part's own origin lands in the world, and how large it is drawn: the positions
  // and scales of the groups around it, combined.
  at: [number, number, number]
  scale: number
}

function locateAll(node: ReactNode, type: unknown, around: Omit<Found, 'props'>): Found[] {
  if (Array.isArray(node)) return node.flatMap((child) => locateAll(child, type, around))
  if (!isValidElement<Record<string, unknown>>(node)) return []
  if (node.type === type) return [{ props: node.props, ...around }]
  const { position, scale, children } = node.props
  const isGroup = node.type === 'group'
  const [x = 0, y = 0, z = 0]: number[] = isGroup && Array.isArray(position) ? position : []
  const { at, scale: outer } = around
  return locateAll(children as ReactNode, type, {
    at: [at[0] + outer * x, at[1] + outer * y, at[2] + outer * z],
    scale: outer * (isGroup && typeof scale === 'number' ? scale : 1)
  })
}

const locate = (node: ReactNode, type: unknown): Found | undefined =>
  locateAll(node, type, { at: [0, 0, 0], scale: 1 })[0]

// Where a point a part draws at lands on the floor.
const drawnAt = (found: Found, point: { x: number; z: number }) => ({
  x: found.at[0] + found.scale * point.x,
  z: found.at[2] + found.scale * point.z
})

const theme = themeForTeam()
const viewOf = (floor: FloorGeometry) =>
  FloorView({
    floor,
    floorTheme: theme,
    zoneGroups: groupZonesByTheme(floor, () => theme.id),
    wallsMode: 'cutaway',
    isReducedMotion: true
  })

describe('furniture sized for the larger agents', () => {
  const worker = (id: string) => ({ id, type: 'worker', activity: 'reading' as const })
  // Two guests at their lead's desks and a third in the team area.
  const sessions = [{ ...session('lead'), subagents: ['0', '1', '2'].map(worker) }, session('b')]
  const layout = buildLayout(sessions, undefined)
  const floor = toFloorGeometry(layout, sessions)[0]
  const view = viewOf(floor)
  const desks = locateAll(view, theme.kit.zone.Desk, { at: [0, 0, 0], scale: 1 })

  it('scales each desk about its own seat, which stays where the sim put it', () => {
    expect(desks).toHaveLength(floor.rooms.flatMap((room) => room.seats).length)
    for (const desk of desks) {
      const seat = desk.props.slot as DeskSlot
      const landed = drawnAt(desk, seat)
      expect(landed.x).toBeCloseTo(seat.x, 9)
      expect(landed.z).toBeCloseTo(seat.z, 9)
      expect(desk.scale).toBe(seat.slotId === 'desk_main' ? FURNITURE_SCALE : GUEST_FURNITURE_SCALE)
      // The desk itself, drawn 0.62 m ahead of the seat, moves out by the same factor.
      const ahead = drawnAt(desk, { x: seat.x, z: seat.z + DESK_REACH })
      expect(ahead.z - seat.z).toBeCloseTo(DESK_REACH * desk.scale, 9)
    }
  })

  it('keeps guest seats in the room and clear of the main desk and the main figure', () => {
    const DESK_M = { width: 1.3, depth: 0.65 }
    const FIGURE_RADIUS_M = 0.3
    const office = floor.rooms.find((room) => room.sessionKey === 'lead')!
    const main = office.seats.find((seat) => seat.slotId === 'desk_main')!
    const guests = office.seats.filter((seat) => seat.slotId.startsWith('desk_guest'))
    expect(guests.map((seat) => seat.x - office.x)).toEqual([-1.25, 1.25])
    const footprint = (seat: DeskSlot, scale: number) => ({
      minX: seat.x - (DESK_M.width / 2) * scale,
      maxX: seat.x + (DESK_M.width / 2) * scale,
      minZ: seat.z + (DESK_REACH - DESK_M.depth / 2) * scale,
      maxZ: seat.z + (DESK_REACH + DESK_M.depth / 2) * scale
    })
    const mainDesk = footprint(main, FURNITURE_SCALE)
    const mainFigure = FIGURE_RADIUS_M * FURNITURE_SCALE
    expect(mainDesk.maxZ).toBeLessThan(office.z + office.depth / 2)
    for (const guest of guests) {
      const desk = footprint(guest, GUEST_FURNITURE_SCALE)
      expect(desk.minX).toBeGreaterThan(office.x - office.width / 2)
      expect(desk.maxX).toBeLessThan(office.x + office.width / 2)
      expect(desk.minZ).toBeGreaterThan(office.z - office.depth / 2)
      // The guest sits behind the main desk's near edge, and its own desk misses the main figure.
      expect(guest.z + FIGURE_RADIUS_M * GUEST_FURNITURE_SCALE).toBeLessThan(mainDesk.minZ)
      expect(Math.min(Math.abs(desk.minX - main.x), Math.abs(desk.maxX - main.x))).toBeGreaterThan(
        mainFigure
      )
    }
  })

  it('draws the game corner with a beanbag on every sim lounge seat', () => {
    const simLounge = layout.floors[0].zones[0].lounge!
    const lounge = locate(view, GameCorner)!
    // The floor's own lounge, unchanged between renders, so the corner's parts are built once.
    expect(lounge.props.lounge).toBe(floor.zones[0].lounge)
    const drawn = loungeAsDrawn(lounge.props.lounge as LoungeGeometry)
    expect(lounge.scale).toBe(FURNITURE_SCALE)
    expect(locate(view, theme.kit.zone.Lounge)).toBeUndefined()
    // Five agents: the corner is handed the 6 x 7 m lounge of eight seats the sim lays out.
    expect([drawn.width, drawn.depth]).toEqual([expect.closeTo(6, 9), expect.closeTo(7, 9)])
    expect(drawn.seats).toHaveLength(8)
    expect(simLounge.slots).toHaveLength(8)
    for (const [index, stool] of drawn.seats.entries()) {
      const landed = drawnAt(lounge, stool)
      expect(landed.x).toBeCloseTo(simLounge.slots[index].x, 9)
      expect(landed.z).toBeCloseTo(simLounge.slots[index].z, 9)
    }
    const corner = drawnAt(lounge, {
      x: drawn.x - drawn.width / 2,
      z: drawn.z - drawn.depth / 2
    })
    expect(corner.x).toBeCloseTo(simLounge.x - simLounge.width / 2, 9)
    expect(corner.z).toBeCloseTo(simLounge.z - simLounge.depth / 2, 9)
  })

  it('seats overview agents on beanbags at the sim lounge seats, in one group about the lounge', () => {
    const simLounge = layout.floors[0].zones[0].lounge!
    const overview = FloorView({
      floor,
      floorTheme: theme,
      zoneGroups: groupZonesByTheme(floor, () => theme.id),
      wallsMode: 'cutaway',
      isReducedMotion: true,
      isOverview: true
    })
    const corner = locate(overview, GameCorner)!
    expect(corner.scale).toBe(FURNITURE_SCALE)
    const drawn = locateAll(
      GameCorner(corner.props as Parameters<typeof GameCorner>[0]),
      Parts,
      corner
    )
    expect(drawn).toHaveLength(1)
    const bags = drawn[0].props.parts as PartSpec[]
    expect(bags).toHaveLength(simLounge.slots.length)
    for (const [index, bag] of bags.entries()) {
      const landed = drawnAt(drawn[0], { x: bag.at[0], z: bag.at[2] })
      expect(landed.x).toBeCloseTo(simLounge.slots[index].x, 9)
      expect(landed.z).toBeCloseTo(simLounge.slots[index].z, 9)
    }
    // One body per seat, the one the full corner draws there: the 512-worker overview stays
    // inside its triangle ceiling.
    const full = gameCornerParts(
      loungeAsDrawn(corner.props.lounge as LoungeGeometry),
      theme.palette
    )
    expect(full).toEqual(expect.arrayContaining(bags))
  })

  it('shrinks a known lounge about its centre to the size its theme draws', () => {
    const S = FURNITURE_SCALE
    const known: LoungeGeometry = {
      id: 'c:lounge',
      x: 10,
      z: 20,
      width: 6 * S,
      depth: 5 * S,
      door: { x: 10, z: 20 - 2.5 * S },
      seats: [{ slotId: 'lounge_seat_0', x: 10 - 1.875 * S, z: 20 - 0.5 * S, heading: 0 }]
    }
    const drawn = loungeAsDrawn(known)
    expect(drawn).toMatchObject({ id: 'c:lounge', x: 10, z: 20 })
    expect([drawn.width, drawn.depth]).toEqual([expect.closeTo(6, 9), expect.closeTo(5, 9)])
    expect(drawn.door).toEqual({ x: 10, z: expect.closeTo(17.5, 9) })
    expect(drawn.seats).toEqual([
      {
        slotId: 'lounge_seat_0',
        x: expect.closeTo(8.125, 9),
        z: expect.closeTo(19.5, 9),
        heading: 0
      }
    ])
  })
})

describe.each([
  ['a lone company', ZKIDZ],
  ['the owner-like floor', [...ZKIDZ, ['alpha', '1', 1], ['beta', '1', 1]] as Seed]
])('theme parts on the plate of %s', (_name, seed) => {
  const sessions = sessionsOf(seed)
  const layout = buildLayout(sessions, undefined)
  const floor = toFloorGeometry(layout, sessions)[0]
  // The sim says where the plate lies; it is never centred on the gate here.
  const centre = { x: layout.floors[0].x, z: layout.floors[0].z }
  const floorView = viewOf(floor)

  it('draws the lift on the very point where the sim lets agents in', () => {
    expect(centre.x).toBeGreaterThan(30)
    const gate = layout.floors[0].elevator
    const lift = locate(floorView, theme.kit.floor.Elevator)!
    const drawn = lift.props.floor as FloorGeometry
    expect([lift.at[0] + drawn.elevator.x, lift.at[2] + drawn.elevator.z]).toEqual([gate.x, gate.z])
    expect([gate.x, gate.z]).toEqual([0, 0])
  })

  it('lays the slab on the plate and its lane on the street', () => {
    const slab = locate(floorView, theme.kit.floor.Slab)!
    const drawn = slab.props.floor as FloorGeometry
    expect([slab.at[0], slab.at[2]]).toEqual([centre.x, centre.z])
    expect(drawn).toMatchObject({ width: floor.width, depth: floor.depth, x: 0, z: 0 })
    expect(slab.at[2] + drawn.corridor.z).toBe(0)
  })

  it('leaves companies in the coordinates the sim gave them', () => {
    const company = locate(floorView, theme.kit.zone.CompanyZone)!
    expect(company.at).toEqual([0, 0, 0])
    expect(floor.zones).toContain(company.props.zone)
  })
})
