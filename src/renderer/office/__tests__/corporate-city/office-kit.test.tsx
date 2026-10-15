import { describe, expect, it, vi } from 'vitest'
import { Texture } from 'three'
import { FURNITURE_SCALE } from '../../../../shared/office/figure-scale'
import {
  DESK_REACH,
  floorWallSegments,
  WALL_HEIGHT_LOW,
  wallHeight,
  type WallsMode
} from '../../logic/room-layout'
import { walkGround } from '../../player/walk-ground'
import type { FloorGeometry, LoungeGeometry, RoomGeometry, ZoneGeometry } from '../../scene-model'
import { BandedWalls } from '../../themes/BandedWalls'
import { firstClear } from '../../themes/lounge-layout'
import { everyElement, mergedDraws } from '../../themes/scene.test-utils'
import { CORPORATE_KIT } from '../../themes/corporate-city/office-kit'
import { CORPORATE_DESK_PARTS } from '../../themes/corporate-city/office-furniture'
import { corporateLoungeDecorParts } from '../../themes/corporate-city/CorporateLounge'
import {
  CORPORATE_WALL_BANDS,
  CORPORATE_PARTITION_HEIGHT,
  CorporateWalls
} from '../../themes/corporate-city/CorporateWalls'
import { CORPORATE_MATERIALS, CORPORATE_PALETTE } from '../../themes/corporate-city/palette'

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => object) => factory(),
  useLayoutEffect: () => undefined,
  useRef: (current: object) => ({ current })
}))
vi.mock('@react-three/fiber', () => import('../../themes/frame-capture.test-utils'))
vi.mock('../../scene/textures', () => ({ signTexture: () => new Texture() }))

const ROOM: RoomGeometry = {
  id: 'corporate-office',
  sessionKey: 'session',
  x: 0,
  z: 0,
  width: 6,
  depth: 6,
  door: { x: 0, z: 3 },
  label: 'Product studio',
  kind: 'office',
  seats: [{ slotId: 'desk_main', x: 0, z: 0, heading: 0 }]
}
const LOUNGE: LoungeGeometry = {
  id: 'corporate-lounge',
  x: 4,
  z: 12,
  width: 9,
  depth: 7,
  door: { x: 4, z: 8.5 },
  seats: [
    { slotId: 'lounge-one', x: 3, z: 11, heading: 0 },
    { slotId: 'lounge-two', x: 5, z: 11, heading: Math.PI / 2 },
    { slotId: 'lounge-three', x: 4, z: 13, heading: Math.PI }
  ]
}
const PROJECT: ZoneGeometry = {
  id: 'corporate-project',
  kind: 'project',
  label: 'City project',
  x: 0,
  z: 0,
  width: 10,
  depth: 10,
  door: { x: 0, z: 5 },
  companyKey: 'company',
  projectKey: 'project',
  sessionKey: null,
  children: []
}
const FLOOR: FloorGeometry = {
  floorId: 'corporate-floor',
  label: 'City office',
  plate: 0,
  x: 0,
  z: 0,
  width: 24,
  depth: 30,
  corridor: { z: 6, width: 3 },
  rooms: [ROOM],
  zones: [],
  elevator: { x: -9, z: 6 }
}
const { floor: floorKit, zone: zoneKit } = CORPORATE_KIT
const EPSILON = 1e-6
const WALL_MODES: readonly WallsMode[] = ['up', 'cutaway', 'down']

describe('Corporate City office kit', () => {
  it('provides the complete floor and zone kit without depending on ambient or the cast', () => {
    expect(Object.keys(floorKit).sort()).toEqual(['Elevator', 'Slab'])
    expect(Object.keys(zoneKit).sort()).toEqual([
      'CompanyZone',
      'Desk',
      'Doorway',
      'Lounge',
      'ProjectOffice',
      'RoomDressing',
      'RoomFloors',
      'RoomSign',
      'Walls'
    ])
    expect(
      [...Object.values(floorKit), ...Object.values(zoneKit)].every(
        (component) => typeof component === 'function'
      )
    ).toBe(true)
  })

  it('anchors the desk and chair to the exact seat and yaw without a second scale', () => {
    const slot = { slotId: 'rotated-seat', x: 7, z: -4, heading: Math.PI / 2 }
    const root = everyElement(<zoneKit.Desk room={ROOM} slot={slot} />)[0]
    expect(root.props).toMatchObject({ position: [7, 0, -4], rotation: [0, Math.PI / 2, 0] })
    expect(root.props).not.toHaveProperty('scale')
  })

  it('keeps every workstation part inside the player collision footprint', () => {
    const workstation = CORPORATE_DESK_PARTS.filter((part) => part.at[2] > 0.29)
    expect(workstation.length).toBeGreaterThan(6)
    for (const part of workstation) {
      expect((Math.abs(part.at[0]) + part.size[0] / 2) * FURNITURE_SCALE).toBeLessThanOrEqual(
        0.65 * FURNITURE_SCALE + EPSILON
      )
      expect(
        (Math.abs(part.at[2] - DESK_REACH) + part.size[2] / 2) * FURNITURE_SCALE
      ).toBeLessThanOrEqual(0.325 * FURNITURE_SCALE + EPSILON)
    }
    expect(workstation).toContainEqual(
      expect.objectContaining({
        at: [0, 0.54, DESK_REACH],
        size: [1.2, 0.06, 0.62]
      })
    )
  })

  it('leaves the seated torso clear and confines the chair to its reserved seat', () => {
    const chair = CORPORATE_DESK_PARTS.filter((part) => part.at[2] <= 0.29)
    expect(chair.length).toBeGreaterThan(5)
    for (const part of chair) {
      expect(Math.abs(part.at[0]) + part.size[0] / 2).toBeLessThanOrEqual(0.25 + EPSILON)
      expect(Math.abs(part.at[2]) + part.size[2] / 2).toBeLessThanOrEqual(0.25 + EPSILON)
      if (part.at[1] + part.size[1] / 2 > 0.365)
        expect(part.at[2] + part.size[2] / 2).toBeLessThanOrEqual(-0.15)
    }
  })

  it('keeps navigation doors open for every desk heading', () => {
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const room = { ...ROOM, seats: [{ ...ROOM.seats[0], heading }] }
      const ground = walkGround({ ...FLOOR, rooms: [room] }, [], FLOOR)
      expect(ground.isOpen(room.door)).toBe(true)
      expect(ground.isOpen(room.seats[0])).toBe(false)
    }
  })

  it.each(WALL_MODES)('delegates %s to the shared animated wall contract', (mode) => {
    const rendered = CorporateWalls({ rooms: [ROOM], mode, isReducedMotion: true })
    expect(rendered.type).toBe(BandedWalls)
    expect(rendered.props).toMatchObject({ rooms: [ROOM], mode, isReducedMotion: true })
  })

  it('drops camera-facing panels in cutaway and keeps all panels below seated sightlines', () => {
    const segments = floorWallSegments([ROOM])
    const heights = segments.map((segment) => wallHeight('cutaway', segment, { x: 20, z: 20 }))
    expect(heights).toContain(WALL_HEIGHT_LOW)
    expect(heights.some((height) => height > WALL_HEIGHT_LOW)).toBe(true)
    for (const height of [WALL_HEIGHT_LOW, 1.3]) {
      const spans = CORPORATE_WALL_BANDS.map((band) => band.span(height))
      expect(spans.every((span) => span.scaleY > 0)).toBe(true)
      expect(Math.min(...spans.map((span) => span.y - span.scaleY / 2))).toBeCloseTo(0)
      expect(Math.max(...spans.map((span) => span.y + span.scaleY / 2))).toBeCloseTo(
        Math.min(height, CORPORATE_PARTITION_HEIGHT)
      )
    }
    expect(CORPORATE_PARTITION_HEIGHT).toBeLessThanOrEqual(0.75)
  })

  it('places one lounge chair at each existing seat without moving or enlarging it', () => {
    if (!zoneKit.Lounge) throw new Error('Missing corporate lounge')
    const chairs = everyElement(<zoneKit.Lounge lounge={LOUNGE} />).filter(
      (element) => element.props.name === 'lounge-seat'
    )
    expect(chairs).toHaveLength(LOUNGE.seats.length)
    chairs.forEach((chair, index) => {
      const seat = LOUNGE.seats[index]
      expect(chair.props).toMatchObject({
        position: [seat.x, 0, seat.z],
        rotation: [0, seat.heading, 0]
      })
      expect(chair.props).not.toHaveProperty('scale')
    })
  })

  it('keeps lounge decor in bounds and clear of seats and every door-to-seat walk', () => {
    const parts = corporateLoungeDecorParts(LOUNGE)
    expect(parts.length).toBeGreaterThan(8)
    for (const part of parts) {
      expect(Math.abs(part.at[0] - LOUNGE.x) + part.size[0] / 2).toBeLessThanOrEqual(
        LOUNGE.width / 2 + EPSILON
      )
      expect(Math.abs(part.at[2] - LOUNGE.z) + part.size[2] / 2).toBeLessThanOrEqual(
        LOUNGE.depth / 2 + EPSILON
      )
      const footprint = { x: part.at[0], z: part.at[2], width: part.size[0], depth: part.size[2] }
      expect(firstClear(LOUNGE, [footprint])).toBe(footprint)
    }
    expect(corporateLoungeDecorParts({ ...LOUNGE, width: 0.4, depth: 0.4 })).toEqual([])
  })

  it('omits room dressing when every corner is occupied by a seat', () => {
    const room = {
      ...ROOM,
      seats: [-1, 1].flatMap((across) =>
        [-1, 1].map((along) => ({
          slotId: `corner-${across}-${along}`,
          x: across * 2.59,
          z: along * 2.59,
          heading: 0
        }))
      )
    }
    expect(everyElement(<zoneKit.RoomDressing room={room} />)).toEqual([])
    expect(
      everyElement(<zoneKit.RoomDressing room={{ ...ROOM, width: 0.4, depth: 0.4 }} />)
    ).toEqual([])
  })

  it('uses only opaque, palette-backed unit geometry for its furniture', () => {
    const parts = [...CORPORATE_DESK_PARTS, ...corporateLoungeDecorParts(LOUNGE)]
    const colors = new Set([
      ...Object.values(CORPORATE_PALETTE),
      ...Object.values(CORPORATE_MATERIALS)
    ])
    for (const part of parts) {
      expect(['box', 'cylinder']).toContain(part.shape)
      expect(colors.has(part.color)).toBe(true)
      expect(part.size.every((length) => length > 0 && Number.isFinite(length))).toBe(true)
      expect(part.at.every(Number.isFinite)).toBe(true)
    }
    const elements = everyElement(<zoneKit.Desk room={ROOM} slot={ROOM.seats[0]} />)
    const geometries = elements.filter(
      (element) => typeof element.type === 'string' && element.type.endsWith('Geometry')
    )
    expect(geometries.length).toBeGreaterThan(8)
    geometries
      .filter((element) => element.type === 'boxGeometry')
      .forEach((element) => expect(element.props.args).toEqual([1, 1, 1]))
    expect(elements.some((element) => element.props.transparent)).toBe(false)
  })

  it('batches repeated desks without adding draws', () => {
    const one = mergedDraws(<zoneKit.Desk room={ROOM} slot={ROOM.seats[0]} />)
    const many = mergedDraws(
      Array.from({ length: 12 }, (_, index) => (
        <zoneKit.Desk key={index} room={ROOM} slot={{ ...ROOM.seats[0], x: index * 2 }} />
      ))
    )
    expect(one.untextured).toBeGreaterThan(0)
    expect(many.untextured).toBe(one.untextured)
  })

  it('renders every architectural surface within a bounded procedural draw budget', () => {
    if (!zoneKit.Lounge) throw new Error('Missing corporate lounge')
    const scene = [
      <floorKit.Slab key="slab" floor={FLOOR} />,
      <floorKit.Elevator key="lift" floor={FLOOR} />,
      <zoneKit.CompanyZone key="company" zone={{ ...PROJECT, kind: 'company', width: 20 }} />,
      <zoneKit.ProjectOffice key="project" zone={PROJECT} />,
      <zoneKit.RoomFloors key="floors" rooms={[ROOM]} />,
      <zoneKit.Walls key="walls" rooms={[ROOM]} mode="cutaway" isReducedMotion />,
      <zoneKit.Doorway key="door" room={ROOM} />,
      <zoneKit.RoomSign key="sign" room={ROOM} />,
      <zoneKit.RoomDressing key="dressing" room={ROOM} />,
      <zoneKit.Desk key="desk" room={ROOM} slot={ROOM.seats[0]} />,
      <zoneKit.Lounge key="lounge" lounge={LOUNGE} />
    ]
    const elements = everyElement(scene)
    expect(elements.some((element) => element.props.transparent)).toBe(false)
    expect(mergedDraws(scene).untextured).toBeLessThanOrEqual(24)
  })
})
