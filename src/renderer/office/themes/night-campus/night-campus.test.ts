import { describe, expect, it } from 'vitest'
import { makeFloor, makeRoom, makeZone } from '../../__tests__/fixtures'
import { ISO_START_AZIMUTH } from '../../logic/camera-bands'
import { EMPTY_THEME_ASSIGNMENTS, sceneThemeFor } from '../../logic/office-themes'
import { physicalZoneGroups } from '../../scene/MultiFloorLayer'
import { CAMPUS_THEME_ID, DEFAULT_THEME_ID, getTheme, listThemes } from '../registry'
import { BACK_WALL_HEIGHT_M, campusRoomParts, farSides } from './room-parts'
import { CORPORATE_MATERIALS } from '../corporate-city/palette'
import { SOFA_COLOR } from './palette'

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

  it('draws one slab and one rug in the room colours', () => {
    const parts = campusRoomParts(floor, COLORS)
    expect(parts.filter(withColor(COLORS.slab))).toHaveLength(1)
    expect(parts.filter(withColor(COLORS.rug))).toHaveLength(1)
  })

  it('stands exactly two tall walls outside the far edges, so desks never clip them', () => {
    const walls = campusRoomParts(floor, COLORS).filter(withColor(COLORS.wall))
    expect(walls).toHaveLength(2)
    for (const wall of walls) expect(wall.size[1]).toBe(BACK_WALL_HEIGHT_M)
    const [west, north] = walls
    expect(west.at[0] + west.size[0] / 2).toBeLessThanOrEqual(floor.x - floor.width / 2 + 1e-9)
    expect(north.at[2] + north.size[2] / 2).toBeLessThanOrEqual(floor.z - floor.depth / 2 + 1e-9)
  })

  it('keeps a plant off a corner a desk stands in', () => {
    const plants = (rooms = floor.rooms) =>
      campusRoomParts({ ...floor, rooms }, COLORS).filter(withColor(CORPORATE_MATERIALS.foliage))
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
