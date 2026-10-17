import { describe, expect, it } from 'vitest'
import { makeFloor, makeRoom, makeZone } from '../__tests__/fixtures'
import type { FloorGeometry, ZoneGeometry } from '../scene-model'
import {
  capped,
  heightLimit,
  officesOf,
  sceneExtent,
  surveySite,
  WORLD_APRON,
  type Lot
} from './surroundings'

interface Rect {
  x: number
  z: number
  width: number
  depth: number
}

// Written out again here on purpose: the rules are checked against their own arithmetic.
function gap(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.abs(a.x - b.x) - (a.width + b.width) / 2)
  const dz = Math.max(0, Math.abs(a.z - b.z) - (a.depth + b.depth) / 2)
  return Math.hypot(dx, dz)
}

const PROJECT_INSET_M = 2

// A company with its gate on the south wall and one project office inside it.
function company(id: string, rect: Rect): ZoneGeometry {
  const project: Rect = {
    x: rect.x,
    z: rect.z,
    width: rect.width - PROJECT_INSET_M * 2,
    depth: rect.depth - PROJECT_INSET_M * 2
  }
  return makeZone({
    id,
    kind: 'company',
    companyKey: id,
    ...rect,
    door: { x: rect.x, z: rect.z + rect.depth / 2 },
    children: [
      makeZone({
        id: `${id}/p`,
        kind: 'project',
        companyKey: id,
        projectKey: `${id}/p`,
        ...project,
        door: { x: project.x, z: project.z + project.depth / 2 }
      })
    ]
  })
}

function floorOf(size: { width: number; depth: number }, zones: ZoneGeometry[]): FloorGeometry {
  return makeFloor({
    floorId: 'f1',
    ...size,
    zones,
    corridor: { z: size.depth / 2 - 1, width: 2 },
    elevator: { x: -size.width / 2 + 1.5, z: size.depth / 2 - 1 }
  })
}

const plateOf = (floor: FloorGeometry): Rect => ({
  x: floor.x ?? 0,
  z: floor.z ?? 0,
  width: floor.width,
  depth: floor.depth
})

function apronOf(floor: FloorGeometry): Rect {
  const plate = plateOf(floor)
  const west = plate.x - floor.width / 2 - WORLD_APRON.west
  const east = plate.x + floor.width / 2 + WORLD_APRON.east
  const north = plate.z - floor.depth / 2 - WORLD_APRON.north
  const south = plate.z + floor.depth / 2 + WORLD_APRON.south
  return { x: (west + east) / 2, z: (north + south) / 2, width: east - west, depth: south - north }
}

const lone = floorOf({ width: 28, depth: 24 }, [
  company('c1', { x: 0, z: -1, width: 20, depth: 16 })
])

const busy = floorOf({ width: 96, depth: 44 }, [
  company('c3', { x: 34, z: -3, width: 22, depth: 30 }),
  company('c1', { x: -34, z: -3, width: 22, depth: 30 })
])

const lotAt = (id: string, x: number, z: number, seed: number): Lot => ({
  id,
  kind: 'building',
  x,
  z,
  width: 4,
  depth: 4,
  maxHeight: 10,
  seed
})

describe('nothing may hide a desk', () => {
  it('limits height to 0.7 of the distance to the nearest project office, at most 24 m', () => {
    const offices = officesOf(busy)
    expect(offices).toEqual(busy.zones.flatMap((zone) => zone.children))
    for (const x of [-60, -20, 0, 20, 60]) {
      const rect: Rect = { x, z: 40, width: 5, depth: 5 }
      const nearest = Math.min(...offices.map((office) => gap(rect, office)))
      expect(heightLimit(rect, offices)).toBeCloseTo(Math.min(24, nearest * 0.7), 9)
    }
  })

  it('measures from a room as well, for a floor whose rooms have no project around them', () => {
    const room = makeRoom({ id: 'r1', x: 0, z: 0, width: 6, depth: 5 })
    const floor = makeFloor({ floorId: 'rooms-only', rooms: [room] })
    const rect: Rect = { x: 10, z: 0, width: 2, depth: 2 }
    expect(officesOf(floor)).toEqual([room])
    expect(heightLimit(rect, officesOf(floor))).toBeCloseTo(gap(rect, room) * 0.7, 9)
  })
})

it('surveys the companies in id order and the offices nothing may hide', () => {
  const site = surveySite(busy)
  expect(site.companies.map((zone) => zone.id)).toEqual(['c1', 'c3'])
  expect(site.offices).toEqual(officesOf(busy))
  expect(site.plate).toBe(busy)
})

it('keeps the plate’s lots over the cap and thins the rest by seed', () => {
  const onPlate = lotAt('plate', 0, 0, 900)
  const beyond = [1, 2, 3, 4].map((seed) => lotAt(`ring-${seed}`, 40 + seed * 5, 0, seed))
  expect(capped([...beyond, onPlate], 3, plateOf(lone)).map((lot) => lot.id)).toEqual([
    'ring-1',
    'ring-2',
    'plate'
  ])
  expect(capped(beyond, 9, plateOf(lone))).toEqual(beyond)
})

describe('scene extent', () => {
  it('covers the plate, the apron and every lot', () => {
    const lots = [lotAt('far-west', -80, 0, 1), lotAt('far-south', 0, 60, 2)]
    const extent = sceneExtent(busy, lots)
    for (const rect of [plateOf(busy), apronOf(busy), ...lots]) {
      expect(rect.x - rect.width / 2).toBeGreaterThanOrEqual(extent.x - extent.width / 2 - 1e-9)
      expect(rect.x + rect.width / 2).toBeLessThanOrEqual(extent.x + extent.width / 2 + 1e-9)
      expect(rect.z - rect.depth / 2).toBeGreaterThanOrEqual(extent.z - extent.depth / 2 - 1e-9)
      expect(rect.z + rect.depth / 2).toBeLessThanOrEqual(extent.z + extent.depth / 2 + 1e-9)
    }
  })

  it('is the apron alone when there are no lots, wherever the plate lies', () => {
    expect(sceneExtent(lone, [])).toEqual(apronOf(lone))
    const strip = makeFloor({ floorId: 'strip', width: 71, depth: 17, x: 31, z: 7 })
    expect(sceneExtent(strip, [])).toEqual(apronOf(strip))
  })
})
