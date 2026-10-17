import { expect, it } from 'vitest'
import { buildLayout } from './layout'
import { session } from './fixtures'
import { officeGrid, PathCache, ROUTE_MARGIN_METRES } from './navigation'
import { findPath } from './path'
import { WORKER_BODY_RADIUS } from '../../shared/office/body-footprints'

it('routes from the gate through company, project and office doors only', () => {
  const floor = buildLayout([session('a')], undefined).floors[0]
  const company = floor.zones[0]
  const project = company.children[0]
  const office = floor.rooms.find((r) => r.sessionKey === 'a')!
  const grid = officeGrid(floor)
  const desk = office.slots.find((s) => s.id === 'desk_main')!
  const path = findPath(grid, floor.elevator, desk)
  expect(path.length).toBeGreaterThan(0)
  for (const zone of [company, project, office]) {
    expect(path.some((p) => p.z === zone.door.z && Math.abs(p.x - zone.door.x) <= 0.5)).toBe(true)
    const sealed = {
      ...grid,
      blocked: [
        ...grid.blocked,
        ...Array.from(
          { length: 5 },
          (_, i) =>
            `${Math.round((zone.door.x - 0.5 + i * 0.25 - grid.origin.x) / 0.25)},${Math.round((zone.door.z - grid.origin.z) / 0.25)}`
        )
      ]
    }
    expect(findPath(sealed, floor.elevator, desk)).toEqual([])
  }
})

it('lays the grid over the plate and reaches every desk from the gate', () => {
  const inCompany = (company: string, project: string, seat: number) => ({
    ...session(`${company}-${project}-${seat}`, `p_${company}_${project}`),
    companyKey: `c_${company}`,
    companyLabel: company
  })
  // One wide company south of the street and two small ones north of it: the gate is off-centre.
  const sessions = [
    ...[0, 1, 2].map((seat) => inCompany('zkidz', '1', seat)),
    ...[0, 1].map((seat) => inCompany('zkidz', '2', seat)),
    inCompany('alpha', '1', 0),
    inCompany('beta', '1', 0)
  ]
  const floor = buildLayout(sessions, undefined).floors[0]
  const grid = officeGrid(floor)
  expect(floor.x).not.toBe(0)
  expect(grid.origin).toEqual({ x: floor.x - floor.width / 2, z: floor.z - floor.depth / 2 })
  expect([grid.width, grid.height]).toEqual([floor.width * 4 + 1, floor.depth * 4 + 1])
  for (const office of floor.rooms) {
    const desk = office.slots.find((slot) => slot.id === 'desk_main')!
    expect(findPath(grid, floor.elevator, desk).length, office.id).toBeGreaterThan(0)
  }
})

// Inside a seated body's margin with its back to a wall, every nearby free cell is past the wall (I1).
it('routes a walker pressed between a wall and a body along its own side of that wall', () => {
  const floor = buildLayout([session('a')], undefined).floors[0]
  const office = floor.rooms.find((room) => room.sessionKey === 'a')!
  const southWall = office.z + office.depth / 2
  const walker = {
    id: 'walker',
    x: office.x - 0.97,
    z: southWall - 0.16,
    elevation: 0,
    radius: WORKER_BODY_RADIUS
  }
  const seated = { ...walker, id: 'seated', x: walker.x - 0.48, z: walker.z - 1.24 }
  const gap = Math.hypot(walker.x - seated.x, walker.z - seated.z)
  expect(gap > 2 * WORKER_BODY_RADIUS && gap < 2 * WORKER_BODY_RADIUS + ROUTE_MARGIN_METRES).toBe(
    true
  )
  const route = new PathCache(floor).around({
    body: walker,
    to: { x: office.x + 1.25, z: southWall - 0.5 },
    obstacles: [seated]
  })
  expect(route.length).toBeGreaterThan(1)
  expect(route.filter((point) => point.z >= southWall)).toEqual([])
})
