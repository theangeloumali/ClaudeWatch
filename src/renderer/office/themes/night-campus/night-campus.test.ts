import { describe, expect, it } from 'vitest'
import { makeFloor, makeRoom, makeZone } from '../../__tests__/fixtures'
import { ISO_START_AZIMUTH } from '../../logic/camera-bands'
import { EMPTY_THEME_ASSIGNMENTS, sceneThemeFor } from '../../logic/office-themes'
import { physicalZoneGroups } from '../../scene/MultiFloorLayer'
import { CAMPUS_THEME_ID, DEFAULT_THEME_ID, getTheme, listThemes } from '../registry'
import { BACK_WALL_HEIGHT_M, campusRoomParts, farSides, SLAB_THICKNESS_M } from './room-parts'
import { NIGHT_CAMPUS_PALETTE, PLANT_GREEN, SOFA_COLOR } from './palette'
import { CAMPUS_DESK_PARTS } from './CampusDesk'
import { CORPORATE_DESK_PARTS } from '../corporate-city/office-furniture'

const COLORS = { slab: '#3FA65B', rug: '#C9EBCF', wall: '#2E7F45', chip: '#34C759' }
const withColor = (color: string) => (part: { color: string }) => part.color === color

describe('farSides', () => {
  it('puts the back walls west and north of the default camera', () => {
    expect(farSides(ISO_START_AZIMUTH)).toEqual(['west', 'north'])
  })

  it('follows the camera round to the opposite corner', () => {
    expect(farSides(ISO_START_AZIMUTH + Math.PI)).toEqual(['east', 'south'])
  })
})

describe('campusRoomParts', () => {
  const floor = makeFloor({ floorId: 'f', x: 2, z: -1, width: 8, depth: 6 })

  const seated = (seats: { x: number; z: number }[]) => ({
    ...floor,
    width: 16,
    depth: 12,
    x: 0,
    z: 0,
    rooms: [
      makeRoom({
        id: 'r',
        seats: seats.map((seat, index) => ({ slotId: `s${index}`, ...seat, heading: 0 }))
      })
    ]
  })

  it('stands the room on a thick block: a slab-coloured top over darker sides', () => {
    const parts = campusRoomParts(floor, COLORS)
    const [top] = parts.filter(withColor(COLORS.slab))
    const body = parts.find((part) => part.color === COLORS.wall && part.at[1] < 0)
    expect(parts.filter(withColor(COLORS.slab))).toHaveLength(1)
    expect(top.at[1] + top.size[1] / 2).toBeCloseTo(0, 1)
    expect(SLAB_THICKNESS_M).toBeGreaterThanOrEqual(0.5)
    expect((body?.at[1] ?? 0) - (body?.size[1] ?? 0) / 2).toBeCloseTo(-SLAB_THICKNESS_M)
  })

  it('lays one rug under the desk cluster only, leaving the slab colour round it', () => {
    const room = seated([
      { x: -2, z: -1 },
      { x: 1, z: 2 }
    ])
    const rugs = campusRoomParts(room, COLORS).filter(withColor(COLORS.rug))
    expect(rugs).toHaveLength(1)
    const [rug] = rugs
    expect(rug.size[0] * rug.size[2]).toBeLessThan(room.width * room.depth * 0.6)
    for (const seat of room.rooms[0].seats) {
      expect(Math.abs(seat.x - rug.at[0])).toBeLessThan(rug.size[0] / 2)
      expect(Math.abs(seat.z - rug.at[2])).toBeLessThan(rug.size[2] / 2)
    }
  })

  it('lays no rug in a room with no desks', () => {
    expect(campusRoomParts(floor, COLORS).filter(withColor(COLORS.rug))).toHaveLength(0)
  })

  it('keeps every prop below the wall top, so walls read as solid panels', () => {
    const room = seated([{ x: 0, z: 0 }])
    expect(BACK_WALL_HEIGHT_M).toBeGreaterThanOrEqual(2.5)
    for (const part of campusRoomParts({ ...room, depth: 12 }, COLORS))
      expect(part.at[1] + part.size[1] / 2).toBeLessThanOrEqual(BACK_WALL_HEIGHT_M + 1e-9)
  })

  it('stands exactly two tall walls outside the far edges, so desks never clip them', () => {
    const walls = campusRoomParts(floor, COLORS).filter(
      (part) => part.color === COLORS.wall && part.at[1] > 0
    )
    expect(walls).toHaveLength(2)
    for (const wall of walls) expect(wall.size[1]).toBe(BACK_WALL_HEIGHT_M)
    const [west, north] = walls
    expect(west.at[0] + west.size[0] / 2).toBeLessThanOrEqual(floor.x - floor.width / 2 + 1e-9)
    expect(north.at[2] + north.size[2] / 2).toBeLessThanOrEqual(floor.z - floor.depth / 2 + 1e-9)
  })

  it('keeps a plant off a corner a desk stands in', () => {
    const plants = (rooms = floor.rooms) =>
      campusRoomParts({ ...floor, rooms }, COLORS).filter(withColor(PLANT_GREEN))
    const corner = makeRoom({
      id: 'r',
      seats: [{ slotId: 'desk_main', x: 5.3, z: 1.4, heading: 0 }]
    })
    expect(plants([corner]).length).toBeLessThan(plants().length)
  })

  it('adds a sofa to a deep room only', () => {
    const sofas = (depth: number) =>
      campusRoomParts({ ...floor, depth }, COLORS).filter(withColor(SOFA_COLOR))
    expect(sofas(5)).toHaveLength(0)
    expect(sofas(12).length).toBeGreaterThan(0)
  })

  it('stays a small fixed set of parts however many desks the room holds', () => {
    const seats = Array.from({ length: 12 }, (_, index) => ({
      slotId: `s${index}`,
      x: -1 + (index % 4) * 1.6,
      z: -2 + Math.floor(index / 4) * 1.6,
      heading: 0
    }))
    const wide = { ...floor, width: 16, depth: 10, rooms: [makeRoom({ id: 'r', seats })] }
    expect(campusRoomParts(wide, COLORS).length).toBeLessThanOrEqual(60)
  })
})

describe('campus desk', () => {
  it('is the corporate desk with only its top turned white', () => {
    const changed = CAMPUS_DESK_PARTS.filter((part, index) => part !== CORPORATE_DESK_PARTS[index])
    expect(changed.map((part) => part.color)).toEqual([NIGHT_CAMPUS_PALETTE.wood])
  })
})

describe('Night Campus resolution', () => {
  it('is registered but kept out of the map theme picker', () => {
    expect(getTheme(CAMPUS_THEME_ID).label).toBe('Night Campus')
    expect(listThemes().map((theme) => theme.id)).not.toContain(CAMPUS_THEME_ID)
  })

  it('replaces the chosen theme only while the layout is campus', () => {
    const chosen = getTheme('violet-court')
    expect(sceneThemeFor(chosen, 'campus').id).toBe(CAMPUS_THEME_ID)
    expect(sceneThemeFor(chosen, 'city')).toBe(chosen)
  })

  it('owns every zone and room in campus, whatever was assigned', () => {
    const project = makeZone({ id: 'p', kind: 'project', projectKey: 'pk', companyKey: 'ck' })
    const floor = makeFloor({
      floorId: 'f',
      zones: [project],
      rooms: [makeRoom({ id: 'r', themeId: 'samurai-empire' })]
    })
    const assignments = { ...EMPTY_THEME_ASSIGNMENTS, projects: { pk: 'violet-court' } }
    const campus = physicalZoneGroups({ floor, assignments, theme: getTheme(CAMPUS_THEME_ID) })
    expect(campus.map((group) => group.themeId)).toEqual([CAMPUS_THEME_ID])
    const city = physicalZoneGroups({ floor, assignments, theme: getTheme(DEFAULT_THEME_ID) })
    expect(city.map((group) => group.themeId)).not.toContain(CAMPUS_THEME_ID)
  })
})
