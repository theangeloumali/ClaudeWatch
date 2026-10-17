import { describe, expect, it } from 'vitest'
import { ISO_START_AZIMUTH } from '../logic/camera-bands'
import {
  boundsOfZone,
  cardSafeArea,
  frameBounds,
  HUD_SAFE_INSETS,
  occupiedBounds,
  plateLocalFloor,
  projectToScreen,
  type Bounds,
  type ScreenView
} from '../logic/zone-framing'
import { makeFloor, makeRoom, makeZone } from './fixtures'

const VIEWPORT = { width: 1440, height: 900 }
const CARD_HEIGHT_M = 2.6

function corners(bounds: Bounds) {
  return [bounds.minX, bounds.maxX].flatMap((x) =>
    [bounds.minZ, bounds.maxZ].flatMap((z) => [0, CARD_HEIGHT_M].map((y) => ({ x, y, z })))
  )
}

function expectInsideSafeArea(bounds: Bounds, view: ScreenView) {
  for (const corner of corners(bounds)) {
    const point = projectToScreen(corner, view, VIEWPORT)
    expect(point.x).toBeGreaterThanOrEqual(HUD_SAFE_INSETS.left - 0.5)
    expect(point.x).toBeLessThanOrEqual(VIEWPORT.width - HUD_SAFE_INSETS.right + 0.5)
    expect(point.y).toBeGreaterThanOrEqual(HUD_SAFE_INSETS.top - 0.5)
    expect(point.y).toBeLessThanOrEqual(VIEWPORT.height - HUD_SAFE_INSETS.bottom + 0.5)
  }
}

function project(id: string, x: number, z: number, sessionKey: string) {
  return makeZone({
    id,
    kind: 'project',
    projectKey: id,
    x,
    z,
    width: 8,
    depth: 7,
    children: [makeZone({ id: `${id}/o`, kind: 'office', sessionKey, x, z })]
  })
}

describe('occupiedBounds', () => {
  it('frames only the project offices that hold a live session, padded', () => {
    const floor = makeFloor({
      floorId: 'f',
      width: 120,
      depth: 80,
      zones: [
        makeZone({
          id: 'c',
          kind: 'company',
          width: 100,
          depth: 70,
          children: [project('busy', 50, 30, 'claude:a'), project('empty', -40, -30, 'claude:gone')]
        })
      ]
    })
    const bounds = occupiedBounds(floor, new Set(['claude:a']))
    expect(bounds.minX).toBeLessThan(46)
    expect(bounds.maxX).toBeGreaterThan(54)
    expect(bounds.minX).toBeGreaterThan(40)
    expect(bounds.minZ).toBeGreaterThan(20)
  })

  it('falls back to the leaf rooms, then the plate, when nothing is zoned', () => {
    const rooms = makeFloor({
      floorId: 'f',
      rooms: [makeRoom({ id: 'r', sessionKey: 'claude:a', x: 3, z: 4 })]
    })
    expect(occupiedBounds(rooms, new Set(['claude:a'])).minX).toBeGreaterThan(-5)
    const plate = occupiedBounds(makeFloor({ floorId: 'f', width: 20, depth: 16 }), new Set())
    expect(plate).toEqual({ minX: -10, maxX: 10, minZ: -8, maxZ: 8 })
  })

  it('frames the plate where it lies when the gate is not at its centre', () => {
    const strip = makeFloor({ floorId: 'f', width: 71, depth: 17, x: 31, z: 7 })
    expect(occupiedBounds(strip, new Set())).toEqual({
      minX: -4.5,
      maxX: 66.5,
      minZ: -1.5,
      maxZ: 15.5
    })
  })
})

describe('the plate and its theme parts', () => {
  const lounge = {
    id: 'c:lounge',
    x: 40,
    z: 9,
    width: 6,
    depth: 5,
    door: { x: 40, z: 6.5 },
    seats: [{ slotId: 'lounge-0', x: 39, z: 9, heading: 0 }]
  }
  const project = makeZone({ id: 'c/p', kind: 'project', x: 12, z: 7, door: { x: 12, z: 4.5 } })
  const strip = makeFloor({
    floorId: 'f',
    width: 71,
    depth: 17,
    x: 31,
    z: 7,
    corridor: { z: 0, width: 3 },
    elevator: { x: 0, z: 0 },
    rooms: [makeRoom({ id: 'r', x: 5, z: 6 })],
    zones: [makeZone({ id: 'c', kind: 'company', x: 31, z: 7, lounge, children: [project] })]
  })

  it('hands theme parts a floor measured from the plate centre, the same size', () => {
    const local = plateLocalFloor(strip)
    expect(local).toMatchObject({ width: 71, depth: 17, x: 0, z: 0 })
    expect(local.corridor).toEqual({ z: -7, width: 3 })
    expect(local.elevator).toEqual({ x: -31, z: -7 })
    // Drawn inside a group at the plate centre, the lift lands back on the gate.
    expect([strip.x + local.elevator.x, strip.z + local.elevator.z]).toEqual([0, 0])
    expect(strip.z + local.corridor.z).toBe(strip.corridor.z)
    expect(strip.elevator).toEqual({ x: 0, z: 0 })
  })

  it('moves every zone, lounge, room, seat and door into the same frame', () => {
    const local = plateLocalFloor(strip)
    const [company] = local.zones
    expect(company).toMatchObject({ x: 0, z: 0, width: 6, depth: 5 })
    expect(company.children[0]).toMatchObject({ x: -19, z: 0, door: { x: -19, z: -2.5 } })
    expect(company.lounge).toMatchObject({ x: 9, z: 2, door: { x: 9, z: -0.5 } })
    expect(company.lounge?.seats[0]).toMatchObject({ x: 8, z: 2, heading: 0 })
    expect(local.rooms[0]).toMatchObject({ x: -26, z: -1, door: { x: -31, z: -8.5 } })
    expect(local.rooms[0].seats[0]).toMatchObject({ x: -31, z: -10.7 })
    // The floor it was made from is left as it was.
    expect(strip.zones[0].children[0]).toMatchObject({ x: 12, z: 7 })
  })

  it('changes nothing for a plate that is centred on the gate', () => {
    const centred = makeFloor({ floorId: 'f', elevator: { x: -8, z: 2 } })
    expect(plateLocalFloor(centred)).toEqual(centred)
  })
})

describe('cardSafeArea', () => {
  it('keeps name cards off the left rail, the right panel, the top bar and the bottom bar', () => {
    expect(cardSafeArea(VIEWPORT)).toEqual({
      left: HUD_SAFE_INSETS.left,
      right: VIEWPORT.width - HUD_SAFE_INSETS.right,
      top: HUD_SAFE_INSETS.top,
      bottom: VIEWPORT.height - HUD_SAFE_INSETS.bottom
    })
  })

  it('uses the full width once the rails stack on a narrow window', () => {
    expect(cardSafeArea({ width: 700, height: 900 })).toMatchObject({ left: 0, right: 700 })
  })
})

describe('frameBounds', () => {
  it('keeps a lone office at the plate edge clear of the HUD rails', () => {
    const bounds = boundsOfZone(
      makeZone({ id: 'edge', kind: 'project', x: 58, z: 38, width: 8, depth: 7 })
    )
    const framing = frameBounds(bounds, VIEWPORT, { azimuth: ISO_START_AZIMUTH })
    expectInsideSafeArea(bounds, { ...framing, azimuth: ISO_START_AZIMUTH })
  })

  it('fits many offices inside the safe area at every isometric corner', () => {
    const bounds: Bounds = { minX: -60, maxX: 60, minZ: -40, maxZ: 40 }
    for (const azimuth of [
      ISO_START_AZIMUTH,
      ISO_START_AZIMUTH + Math.PI / 2,
      ISO_START_AZIMUTH + Math.PI
    ]) {
      const framing = frameBounds(bounds, VIEWPORT, { azimuth })
      expectInsideSafeArea(bounds, { ...framing, azimuth })
    }
  })

  it('still fits the safe area at a free, non-snapped rotation', () => {
    const bounds: Bounds = { minX: 20, maxX: 44, minZ: -30, maxZ: -6 }
    for (const azimuth of [0.3, 1.2217, 2.9, -1.9]) {
      const framing = frameBounds(bounds, VIEWPORT, { azimuth })
      expectInsideSafeArea(bounds, { ...framing, azimuth })
    }
  })

  it('does not zoom a single office closer than the floor band allows', () => {
    const framing = frameBounds({ minX: -1, maxX: 1, minZ: -1, maxZ: 1 }, VIEWPORT, {
      azimuth: ISO_START_AZIMUTH,
      maxZoom: 60
    })
    expect(framing.zoom).toBe(60)
  })
})
