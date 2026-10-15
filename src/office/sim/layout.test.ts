import { describe, expect, it } from 'vitest'
import { FURNITURE_SCALE } from '../../shared/office/figure-scale'
import { buildLayout, type LayoutMap } from './layout'
import { session } from './fixtures'
import { officeGrid, PathCache } from './navigation'
import { findPath } from './path'
import { placements } from './placements'

const inCompany = (company: string, project: string, seat = '') => ({
  ...session(`${company}-${project}${seat && `-${seat}`}`, `p_${company}_${project}`),
  companyKey: `c_${company}`,
  companyLabel: company
})

interface Box {
  x: number
  z: number
  width: number
  depth: number
}
const area = (box: Pick<Box, 'width' | 'depth'>) => box.width * box.depth
// The clear strip between two boxes; negative when they overlap.
const lane = (a: Box, b: Box) =>
  Math.max(
    Math.abs(a.x - b.x) - (a.width + b.width) / 2,
    Math.abs(a.z - b.z) - (a.depth + b.depth) / 2
  )
const isInside = (inner: Box, outer: Box) =>
  Math.abs(inner.x - outer.x) + inner.width / 2 <= outer.width / 2 &&
  Math.abs(inner.z - outer.z) + inner.depth / 2 <= outer.depth / 2
const pairs = <T>(boxes: T[]): [T, T][] =>
  boxes.flatMap((first, index) => boxes.slice(index + 1).map((second): [T, T] => [first, second]))
const liveBays = (layout: LayoutMap) =>
  layout.floors[0].rooms
    .filter((room) => room.kind === 'office')
    .map((room) => room.bay)
    .sort((a, b) => a - b)
// A lounge's lengths are fractional, so a lane beside one is 3 m to the last few digits.
const LANE_M = 3 - 1e-9
function expectClearLanes(layout: LayoutMap): void {
  const floor = layout.floors[0]
  for (const [first, second] of pairs(floor.zones))
    expect(lane(first, second)).toBeGreaterThanOrEqual(LANE_M)
  for (const company of floor.zones) {
    // The plate has its own centre and leaves the 3 m margin around every company.
    expect(
      isInside({ ...company, width: company.width + 6, depth: company.depth + 6 }, floor)
    ).toBe(true)
    const grounds = [...company.children, company.lounge!]
    for (const zone of grounds) expect(isInside(zone, company)).toBe(true)
    for (const [first, second] of pairs(grounds))
      expect(lane(first, second)).toBeGreaterThanOrEqual(LANE_M)
    for (const project of company.children)
      for (const leaf of project.children) expect(isInside(leaf, project)).toBe(true)
  }
}

type Seed = [company: string, project: string, sessions: number][]
const sessionsOf = (seed: Seed) =>
  seed.flatMap(([company, project, count]) =>
    Array.from({ length: count }, (_, seat) => inCompany(company, project, `${seat}`))
  )
const workers = (count: number) =>
  Array.from({ length: count }, (_, id) => ({
    id: `${id}`,
    type: 'worker',
    activity: 'reading' as const
  }))
// A session's bay and where its office sits, measured from the corner its company is held by:
// its west wall and its street side.
function placeInCompany(layout: LayoutMap, sessionKey: string) {
  const floor = layout.floors[0]
  const room = floor.rooms.find((candidate) => candidate.sessionKey === sessionKey)!
  const company = floor.zones.find((zone) => zone.companyKey === room.companyKey)!
  const street = company.z - Math.sign(company.z) * (company.depth / 2)
  return {
    bay: room.bay,
    x: room.x - (company.x - company.width / 2),
    z: Math.abs(room.z - street)
  }
}

describe("a floor shaped like the owner's: one company of four projects and two of one", () => {
  const OWNER: Seed = [
    ['zkidz', '1', 3],
    ['zkidz', '2', 2],
    ['zkidz', '3', 1],
    ['zkidz', '4', 2],
    ['alpha', '1', 1],
    ['beta', '1', 1]
  ]
  const built = () => buildLayout(sessionsOf(OWNER), undefined)
  const sizes = (boxes: Box[]) => boxes.map((box) => [box.width, box.depth])

  it('keeps all the company grounds within 1,900 m2', () => {
    const grounds = built().floors[0].zones.reduce((total, company) => total + area(company), 0)
    expect(grounds).toBeLessThanOrEqual(1900)
  })
  it('uses at least 45% of the grounds for project offices and lounges', () => {
    const companies = built().floors[0].zones
    const grounds = companies.reduce((total, company) => total + area(company), 0)
    const used = companies
      .flatMap((company) => [...company.children, company.lounge!])
      .reduce((total, box) => total + area(box), 0)
    expect(used / grounds).toBeGreaterThanOrEqual(0.45)
  })
  it('makes a project as wide as its desk columns, and a one-session one within 9 x 9 m', () => {
    const [alpha, beta, zkidz] = built().floors[0].zones
    expect(sizes(zkidz.children)).toEqual([
      [16, 8],
      [11, 8],
      [6, 8],
      [11, 8]
    ])
    expect(sizes([...alpha.children, ...beta.children])).toEqual([
      [6, 8],
      [6, 8]
    ])
  })
  it('overlaps nothing and keeps every lane at least 3 m wide', () => {
    expectClearLanes(built())
  })
  it('gives the widest company one side of the street and the two small ones the other', () => {
    const floor = built().floors[0]
    const [alpha, beta, zkidz] = floor.zones
    expect([alpha, beta, zkidz].map((company) => Math.sign(company.z))).toEqual([-1, -1, 1])
    expect([floor.width, floor.depth]).toEqual([73, 32])
  })
  // The limit was 71 x 31 m before the lounge grew for the larger agents. Its plot, on the
  // half metre, is 2 m wider (8 from 6) and, for eight seats, 1 m deeper than the offices.
  it('keeps the plate within 73 x 32 m with at least half of it company grounds', () => {
    const floor = built().floors[0]
    const grounds = floor.zones.reduce((total, company) => total + area(company), 0)
    expect(floor).toMatchObject({ width: 73, depth: 32, x: 35, z: 0.5 })
    expect(grounds / area(floor)).toBeGreaterThanOrEqual(0.5)
  })
  it("makes a lone company's plate its grounds, the street and the margins", () => {
    const alone = sessionsOf(OWNER.filter(([company]) => company === 'zkidz'))
    const floor = buildLayout(alone, undefined).floors[0]
    expect(sizes(floor.zones)).toEqual([[67, 12]])
    // The gate's 3 m, 67 m of grounds, 3 m of margin; the 3 m street, 12 m of grounds, 3 m.
    expect(floor).toMatchObject({ width: 73, depth: 18, x: 35, z: 7.5 })
    expect(floor.elevator).toMatchObject({ x: 0, z: 0 })
    expect(isInside({ ...floor.elevator, width: 3, depth: 3 }, floor)).toBe(true)
    // The lift stands 3 m short of the company's own gateway.
    expect(floor.zones[0].door).toEqual({ x: 3, z: 1.5 })
  })
  it("leaves every other company's rooms where they were when a company grows", () => {
    const layout = built()
    const roomsOf = (map: LayoutMap, companyKey: string) =>
      map.floors[0].rooms.filter((room) => room.companyKey === companyKey)
    const grownBy = (joiner: ReturnType<typeof inCompany>) =>
      buildLayout([...sessionsOf(OWNER), joiner], layout)
    // zkidz has its side of the street to itself: a desk column or a project moves nobody else.
    for (const grown of [grownBy(inCompany('zkidz', '3', 'x')), grownBy(inCompany('zkidz', '9'))]) {
      expect(roomsOf(grown, 'c_zkidz')).not.toEqual(roomsOf(layout, 'c_zkidz'))
      for (const other of ['c_alpha', 'c_beta'])
        expect(roomsOf(grown, other)).toEqual(roomsOf(layout, other))
    }
    // beta is the last company in its row.
    const last = grownBy(inCompany('beta', '1', 'x'))
    for (const other of ['c_alpha', 'c_zkidz'])
      expect(roomsOf(last, other)).toEqual(roomsOf(layout, other))
    // alpha stands before beta in the same row: its desk column pushes beta 5 m, and only beta.
    const first = grownBy(inCompany('alpha', '1', 'x'))
    expect(roomsOf(first, 'c_zkidz')).toEqual(roomsOf(layout, 'c_zkidz'))
    expect(roomsOf(first, 'c_beta').map((room) => [room.x, room.z])).toEqual(
      roomsOf(layout, 'c_beta').map((room) => [room.x + 5, room.z])
    )
  })
  it("keeps a project's place while it and its earlier neighbours stay the same size", () => {
    const layout = built()
    const joiners = ['x', 'y'].map((seat) => inCompany('zkidz', '3', seat))
    const grown = buildLayout([...sessionsOf(OWNER), ...joiners], layout)
    const moved = (key: string) => placeInCompany(grown, key).x - placeInCompany(layout, key).x
    for (const live of sessionsOf(OWNER)) {
      // Two more desk columns in project 3 push only project 4, the one after it.
      if (live.projectKey === 'p_zkidz_4') expect(moved(live.key)).toBe(10)
      else expect(placeInCompany(grown, live.key)).toEqual(placeInCompany(layout, live.key))
    }
    expectClearLanes(grown)
  })
})

it('opens every company onto the street, whichever side of it the company stands on', () => {
  const south = sessionsOf([['wide', '1', 4]]).concat(sessionsOf([['wide', '2', 4]]))
  const layout = buildLayout([...south, inCompany('north', '1')], undefined)
  const [north, wide] = ['c_north', 'c_wide'].map(
    (key) => layout.floors[0].zones.find((zone) => zone.companyKey === key)!
  )
  expect(north.z).toBeLessThan(0)
  expect(wide.z).toBeGreaterThan(0)
  // The street runs along z = 0: the gateway is on the edge nearest to it.
  expect(north.door.z).toBe(north.z + north.depth / 2)
  expect(wide.door.z).toBe(wide.z - wide.depth / 2)
  const paths = new PathCache(layout.floors[0])
  const seat = layout.floors[0].rooms.find((room) => room.companyKey === 'c_north')!.slots[1]
  const walk = paths.via(layout.floors[0].elevator, north.door, seat)
  expect(walk.length).toBeGreaterThan(0)
})

it('keeps a company north of the street where it stands when one of its projects deepens', () => {
  // The wide company takes the south side, so `north` stands across the street from it.
  const south = sessionsOf([['wide', '1', 4]]).concat(sessionsOf([['wide', '2', 4]]))
  const lead = { ...inCompany('north', '1', 'lead'), subagents: workers(3) }
  const crew = [lead, ...sessionsOf([['north', '1', 3]]), inCompany('north', '2')]
  const before = buildLayout([...south, ...crew], undefined)
  const company = before.floors[0].zones.find((zone) => zone.companyKey === 'c_north')!
  expect(company.z).toBeLessThan(0)

  const roomOf = (map: LayoutMap, key: string) =>
    map.floors[0].rooms.find((room) => room.sessionKey === key)
  const teamSeat = (map: LayoutMap) =>
    map.floors[0].rooms
      .find((room) => room.kind === 'team' && room.companyKey === 'c_north')!
      .slots.find((slot) => slot.id === 'team_seat_0')
  const expectHeldInPlace = (after: LayoutMap) => {
    const deeper = after.floors[0].zones.find((zone) => zone.companyKey === 'c_north')!
    expect(deeper.depth).toBeGreaterThan(company.depth)
    // The street side stays put; the company grows away from it.
    expect(deeper.z + deeper.depth / 2).toBe(company.z + company.depth / 2)
    for (const live of crew) {
      const previous = roomOf(before, live.key)!
      expect(roomOf(after, live.key)).toEqual({
        ...previous,
        x: expect.closeTo(previous.x, 10),
        z: expect.closeTo(previous.z, 10),
        door: { x: expect.closeTo(previous.door.x, 10), z: expect.closeTo(previous.door.z, 10) },
        slots: previous.slots.map((slot) => ({
          ...slot,
          x: expect.closeTo(slot.x, 10),
          z: expect.closeTo(slot.z, 10)
        }))
      })
    }
    expect(deeper.lounge!.slots.slice(0, 4)).toEqual(company.lounge!.slots.slice(0, 4))
    expectClearLanes(after)
  }

  // Nine more subagents: ten of them overflow, which takes a second row of team seats.
  const busier = [{ ...lead, subagents: workers(12) }, ...crew.slice(1)]
  const withTeamRow = buildLayout([...south, ...busier], before)
  expectHeldInPlace(withTeamRow)
  const heldTeamSeat = teamSeat(before)!
  expect(teamSeat(withTeamRow)).toEqual({
    ...heldTeamSeat,
    x: expect.closeTo(heldTeamSeat.x, 10),
    z: expect.closeTo(heldTeamSeat.z, 10)
  })

  // A fifth session adds a desk row; as on the south side, only the team area moves past it.
  expectHeldInPlace(buildLayout([...south, ...crew, inCompany('north', '1', 'fifth')], before))
})

it('adds a desk column for each session up to four, then a second row', () => {
  const project = (count: number) => {
    const crew = Array.from({ length: count }, (_, seat) => session(`s${seat}`))
    const { width, depth, capacity } = buildLayout(crew, undefined).floors[0].zones[0].children[0]
    return [width, depth, capacity]
  }
  expect([1, 2, 3, 4, 5, 8, 9].map(project)).toEqual([
    [6, 8, 4],
    [11, 8, 4],
    [16, 8, 4],
    [21, 8, 4],
    [21, 14, 8],
    [21, 14, 8],
    [21, 20, 12]
  ])
})

it('has no team area without subagents, and one only as large as the overflow needs', () => {
  const teamFor = (subagents: number) => {
    const sessions = [{ ...session('a'), subagents: workers(subagents) }]
    const layout = buildLayout(sessions, undefined)
    expect(placements(sessions, layout)).toHaveLength(1 + subagents)
    const team = layout.floors[0].rooms.find((room) => room.kind === 'team')
    return team && [team.slots.filter((slot) => slot.id !== 'door').length, team.width, team.depth]
  }
  expect(teamFor(0)).toBeUndefined()
  // Two guests fit at the desk's own guest seats.
  expect(teamFor(2)).toBeUndefined()
  // Body-sized aisles require a 2.6 m seat pitch, not the former 2 m pitch.
  expect(teamFor(3)).toEqual([1, 4.6, 4.6])
  expect(teamFor(7)).toEqual([5, 12.4, 7.2])
})

const many = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    ...session(`s${String(i).padStart(3, '0')}`, `p_${i % 12}`),
    companyKey: `c_${i % 4}`,
    companyLabel: `Company ${i % 4}`
  }))

describe('nested headquarters layout', () => {
  it('is deterministic for 60 sessions in 12 projects and four companies', () => {
    const sessions = many(60)
    const layout = buildLayout(sessions, undefined)
    expect(layout).toEqual(buildLayout([...sessions].reverse(), undefined))
    expect(layout.floors).toHaveLength(1)
    expect(layout.floors[0].id).toBe('hq')
    expect(layout.floors[0].zones).toHaveLength(4)
    expect(layout.floors[0].zones.flatMap((c) => c.children)).toHaveLength(12)
    expect(layout.floors[0].rooms.filter((r) => r.sessionKey)).toHaveLength(60)
  })
  it('keeps a desk and its place in the company across additions, removals and reloads', () => {
    const saved = buildLayout([session('b')], undefined)
    const before = JSON.stringify(saved)
    const next = buildLayout([session('a'), session('b')], saved)
    expect(next.reservations.b).toEqual(saved.reservations.b)
    // The company widens to the east for the second desk column; b's office does not move.
    expect(next.floors[0].rooms.find((r) => r.sessionKey === 'b')).toEqual(saved.floors[0].rooms[0])
    expect(next.floors[0].zones[0].width).toBeGreaterThan(saved.floors[0].zones[0].width)
    expect(JSON.stringify(saved)).toBe(before)
    const removed = buildLayout([session('b')], next)
    expect(buildLayout([session('a'), session('b')], removed).reservations.a).toEqual(
      next.reservations.a
    )
  })
  it('reserves in steps of four and grows without moving an office inside its company', () => {
    const initial = buildLayout([session('a')], undefined)
    const expanded = buildLayout(
      Array.from({ length: 9 }, (_, i) => session(i ? `b${i}` : 'a')),
      initial
    )
    expect(initial.floors[0].zones[0].children[0].capacity).toBe(4)
    expect(expanded.floors[0].zones[0].children[0].capacity).toBe(12)
    expect(placeInCompany(expanded, 'a')).toEqual(placeInCompany(initial, 'a'))
  })
  it('drops a project and a company with their last session, and the floor shrinks', () => {
    const remaining = [session('b', 'p_b')]
    const full = buildLayout([session('a'), ...remaining, inCompany('other', '1')], undefined)
    const fewer = buildLayout(remaining, full)
    expect(fewer.floors[0].zones.map((company) => company.id)).toEqual(['company:c_work'])
    expect(fewer.floors[0].zones[0].children.map((project) => project.projectKey)).toEqual(['p_b'])
    expect(Object.keys(fewer.reservations)).toEqual(['b'])
    expect(area(fewer.floors[0])).toBeLessThan(area(full.floors[0]))
    expect(area(fewer.floors[0])).toBe(area(buildLayout(remaining, undefined).floors[0]))

    const empty = buildLayout([], fewer)
    expect(empty.floors[0]).toMatchObject({ zones: [], rooms: [], width: 12, depth: 12 })
    expect(empty.reservations).toEqual({})
  })
  it('moves a session down only to close a row or a desk column, never for an arrival', () => {
    const bayOf = (layout: LayoutMap) =>
      Object.fromEntries(Object.entries(layout.reservations).map(([key, held]) => [key, held.bay]))
    // Seven sessions still need both rows, so the freed desk waits for a newcomer.
    const eight = Array.from({ length: 8 }, (_, seat) => session(`k${seat}`))
    const seven = buildLayout(eight.slice(1), buildLayout(eight, undefined))
    expect(bayOf(seven)).toEqual({ k1: 1, k2: 2, k3: 3, k4: 4, k5: 5, k6: 6, k7: 7 })
    expect(bayOf(buildLayout(eight, seven)).k0).toBe(0)

    const five = ['a', 'b', 'c', 'd', 'e'].map((key) => session(key))
    const full = buildLayout(five, undefined)
    expect(bayOf(full)).toEqual({ a: 0, b: 1, c: 2, d: 3, e: 4 })

    // Only the session in the last bay moves, into the freed one, and the second row closes.
    const closed = buildLayout(
      five.filter((s) => s.key !== 'b'),
      full
    )
    expect(bayOf(closed)).toEqual({ a: 0, c: 2, d: 3, e: 1 })
    expect(closed.floors[0].zones[0].children[0].capacity).toBe(4)

    const holed = buildLayout(
      five.filter((s) => s.key !== 'b' && s.key !== 'e'),
      closed
    )
    // Three sessions in one row: the one in the fourth column moves in so that column closes.
    expect(bayOf(holed)).toEqual({ a: 0, c: 2, d: 1 })
    expect(holed.floors[0].zones[0].children[0].width).toBe(16)

    const joined = buildLayout([...five.filter((s) => s.key !== 'b'), session('z')], holed)
    expect(bayOf(joined)).toEqual({ a: 0, c: 2, d: 1, e: 3, z: 4 })
  })
  it('treats a saved order or bay that is not a whole number as never saved', () => {
    const sessions = [session('a'), session('b')]
    const saved = buildLayout(sessions, undefined)
    saved.reservations.b.bay = 1.5
    saved.floors[0].zones[0].index = Number.NaN
    saved.floors[0].zones[0].children[0].index = -2
    expect(buildLayout(sessions, saved)).toEqual(buildLayout(sessions, undefined))
  })
  it('keeps two guests at their parent and allocates overflow per project', () => {
    const sessions = ['p_a', 'p_b'].map((p) => ({
      ...session(p, p),
      subagents: Array.from({ length: 17 }, (_, i) => ({
        id: String(i),
        type: 'worker',
        activity: 'reading' as const
      }))
    }))
    const layout = buildLayout(sessions, undefined)
    const agents = placements(sessions, layout)
    expect(agents.filter((p) => p.slot.id.startsWith('desk_guest'))).toHaveLength(4)
    expect(agents.filter((p) => p.room.kind === 'team')).toHaveLength(30)
    for (const agent of agents) expect(agent.room.projectKey).toBe(agent.session.projectKey)
    expect(new Set(agents.map((p) => `${p.room.id}:${p.slot.id}`)).size).toBe(36)
  })
})

it('keeps a project in its place when a lexically earlier project arrives', () => {
  const saved = buildLayout([session('z', 'p_z')], undefined)
  const next = buildLayout([session('z', 'p_z'), session('a', 'p_a')], saved)
  expect(placeInCompany(next, 'z')).toEqual(placeInCompany(saved, 'z'))
  const projects = next.floors[0].zones[0].children
  expect(projects[0].x === projects[1].x && projects[0].z === projects[1].z).toBe(false)
})

it('moves only the projects after a busy one when it grows', () => {
  const sessions = [session('a', 'p_a'), session('b', 'p_b'), session('c', 'p_c')]
  const saved = buildLayout(sessions, undefined)
  const grown = buildLayout(
    [...sessions, ...Array.from({ length: 20 }, (_, i) => session(`new${i}`, 'p_b'))],
    saved
  )
  expect(placeInCompany(grown, 'a')).toEqual(placeInCompany(saved, 'a'))
  expect(placeInCompany(grown, 'b')).toEqual(placeInCompany(saved, 'b'))
  // p_b went from one desk column to four: p_c stands 15 m further along the shelf.
  expect(placeInCompany(grown, 'c')).toEqual({
    ...placeInCompany(saved, 'c'),
    x: placeInCompany(saved, 'c').x + 15
  })
})

it('keeps every project inside its company after growth and pruning a slot', () => {
  const sessions = Array.from({ length: 7 }, (_, i) => session(`s${i}`, `p_${i}`))
  const saved = buildLayout(sessions, undefined)
  const removed = buildLayout(sessions.slice(1), saved)
  const pruned = buildLayout(sessions.slice(1), removed)
  const grown = buildLayout(
    [
      ...sessions.slice(1),
      session('new', 'p_new'),
      ...Array.from({ length: 30 }, (_, i) => session(`busy${i}`, 'p_3'))
    ],
    pruned
  )
  const company = grown.floors[0].zones[0]
  for (const project of company.children) {
    expect(Math.abs(project.x - company.x) + project.width / 2).toBeLessThanOrEqual(
      company.width / 2
    )
    expect(Math.abs(project.z - company.z) + project.depth / 2).toBeLessThanOrEqual(
      company.depth / 2
    )
  }
})

it('keeps every company on its side when another company grows', () => {
  // Arrival order c, b, a: the rows do not follow the alphabet.
  let sessions = [inCompany('c', '0')]
  let layout = buildLayout(sessions, undefined)
  for (const company of ['b', 'a']) {
    sessions = [...sessions, inCompany(company, '0')]
    layout = buildLayout(sessions, layout)
  }
  const side = (key: string, map = layout) => {
    const zone = map.floors[0].zones.find((z) => z.companyKey === key)!
    const row = map.floors[0].zones.filter((other) => Math.sign(other.z) === Math.sign(zone.z))
    const place = row.sort((a, b) => a.x - b.x).indexOf(zone)
    return [Math.sign(zone.z), place, zone.index]
  }
  const before = ['c_a', 'c_b', 'c_c'].map((key) => side(key))

  sessions = [...sessions, ...['1', '2', '3', '4'].map((project) => inCompany('a', project))]
  const grown = buildLayout(sessions, layout)
  expect(['c_a', 'c_b', 'c_c'].map((key) => side(key, grown))).toEqual(before)
})

it('stays compact after thirty short sessions have come and gone', () => {
  const lead = session('lead')
  let layout = buildLayout([lead], undefined)
  for (let minute = 1; minute <= 30; minute++) {
    layout = buildLayout([lead, session(`worker${minute}`)], layout)
    layout = buildLayout([lead], layout)
  }
  layout = buildLayout([lead, session('last')], layout)

  const floor = layout.floors[0]
  expect(liveBays(layout)).toEqual([0, 1])
  expect(Object.keys(layout.reservations).sort()).toEqual(['last', 'lead'])
  expect(floor.zones[0].children[0].depth).toBeLessThanOrEqual(18)
  expect(area(floor)).toBeLessThan(3000)
})

it('loads a map saved with oversized numbers and brings it out compact', () => {
  const office = (bay: number, sessionKey: string) => ({
    id: `company:c_work:project:p_a:office:${bay}`,
    kind: 'office',
    sessionKey,
    bay,
    index: bay,
    x: 6,
    z: 8,
    width: 4,
    depth: 4,
    door: { x: 6, z: 6 },
    slots: []
  })
  const held = (bay: number, releasedAtMs: number | null) => ({
    floorId: 'hq',
    plate: 0,
    bay,
    companyKey: 'c_work',
    projectKey: 'p_a',
    releasedAtMs
  })
  // What the sprawling version wrote: bays 0 and 31, a 24 x 56 m project, a 138 x 186 m floor.
  const saved: LayoutMap = JSON.parse(
    JSON.stringify({
      version: 1,
      floors: [
        {
          id: 'hq',
          label: 'p_a',
          width: 138,
          depth: 186,
          elevator: { id: 'entrance', x: 0, z: 0, heading: 0 },
          rooms: [office(0, 'lead'), office(31, 'last')],
          zones: [
            {
              id: 'company:c_work',
              kind: 'company',
              companyKey: 'c_work',
              index: 0,
              x: 34.5,
              z: 46.5,
              width: 63,
              depth: 87,
              capacity: 4,
              releasedAtMs: null,
              children: [
                {
                  id: 'company:c_work:project:p_a',
                  kind: 'project',
                  companyKey: 'c_work',
                  projectKey: 'p_a',
                  index: 0,
                  x: 18,
                  z: 34,
                  width: 24,
                  depth: 56,
                  capacity: 32,
                  releasedAtMs: null,
                  children: []
                }
              ]
            }
          ]
        }
      ],
      reservations: {
        lead: held(0, null),
        last: held(31, null),
        ...Object.fromEntries(
          Array.from({ length: 30 }, (_, index) => [`worker${index}`, held(index + 1, 60_000)])
        )
      }
    })
  )

  const layout = buildLayout([session('lead'), session('last')], saved)
  const floor = layout.floors[0]
  expect(layout.version).toBe(1)
  expect(layout.reservations.lead.bay).toBe(0)
  expect(liveBays(layout)).toEqual([0, 1])
  expect(Object.keys(layout.reservations).sort()).toEqual(['last', 'lead'])
  expect(floor.zones[0].children[0]).toMatchObject({ width: 11, depth: 8, capacity: 4 })
  expect(area(floor.zones[0])).toBeLessThan(63 * 87)
  expect(area(floor)).toBeLessThan(3000)
})

describe('a seeded floor of three companies, eight projects and twelve sessions', () => {
  const SEED: Seed = [
    ['a', '1', 2],
    ['a', '2', 2],
    ['a', '3', 1],
    ['b', '1', 2],
    ['b', '2', 1],
    ['b', '3', 1],
    ['c', '1', 2],
    ['c', '2', 1]
  ]
  const seeded = () => sessionsOf(SEED)
  const floorOf = (layout: LayoutMap) => {
    const floor = layout.floors[0]
    const companies = floor.zones
    const projects = companies.flatMap((company) => company.children)
    const lounges = companies.map((company) => company.lounge!)
    return { floor, companies, projects, lounges }
  }

  it('holds exactly that many companies, projects and session offices', () => {
    const { floor, companies, projects } = floorOf(buildLayout(seeded(), undefined))
    expect([companies.length, projects.length]).toEqual([3, 8])
    expect(floor.rooms.filter((room) => room.kind === 'office')).toHaveLength(12)
  })

  // Offices sized to their desks are a smaller share of a floor whose lanes stay 3 m wide, so
  // the share is measured on the grounds and the floor is held to an area.
  it('uses at least 45% of the grounds and keeps the floor under 3,000 m2', () => {
    const { floor, companies, projects, lounges } = floorOf(buildLayout(seeded(), undefined))
    const used = [...projects, ...lounges].reduce((total, box) => total + area(box), 0)
    const grounds = companies.reduce((total, company) => total + area(company), 0)
    expect(used / grounds).toBeGreaterThanOrEqual(0.45)
    expect(area(floor)).toBeLessThan(3000)
  })

  it('overlaps nothing and keeps every lane at least 3 m wide', () => {
    expectClearLanes(buildLayout(seeded(), undefined))
  })

  it('keeps the lanes clear when one project is busy and the companies are lopsided', () => {
    const worker = (id: number) => ({ id: `${id}`, type: 'worker', activity: 'reading' as const })
    const lopsided = [
      ...seeded(),
      ...Array.from({ length: 30 }, (_, seat) => inCompany('a', '2', `busy${seat}`)),
      ...['4', '5', '6', '7'].map((project) => inCompany('a', project)),
      { ...inCompany('d', '1'), subagents: Array.from({ length: 40 }, (_, id) => worker(id)) }
    ]
    const grown = buildLayout(lopsided, buildLayout(seeded(), undefined))
    expectClearLanes(grown)
    expectClearLanes(buildLayout(seeded(), grown))
  })

  it('gives the same map for the same input', () => {
    const layout = buildLayout(seeded(), undefined)
    expect(buildLayout(seeded(), undefined)).toEqual(layout)
    expect(buildLayout(seeded().reverse(), undefined)).toEqual(layout)
    expect(buildLayout(seeded(), layout)).toEqual(layout)
  })

  it('moves only the project after the one a session joins, and nobody across the street', () => {
    const layout = buildLayout(seeded(), undefined)
    const next = buildLayout([...seeded(), inCompany('b', '2', 'new')], layout)
    const roomOf = (map: LayoutMap, key: string) =>
      map.floors[0].rooms.find((room) => room.sessionKey === key)
    expect(roomOf(next, 'b-2-new')).toBeDefined()
    for (const live of seeded()) {
      // Project b-2 gains a desk column, which pushes b-3 along its shelf by 5 m.
      const shift = live.projectKey === 'p_b_3' ? 5 : 0
      expect(placeInCompany(next, live.key)).toEqual({
        ...placeInCompany(layout, live.key),
        x: placeInCompany(layout, live.key).x + shift
      })
      // Company a has the other side of the street to itself.
      if (live.companyKey === 'c_a')
        expect(roomOf(next, live.key)).toEqual(roomOf(layout, live.key))
    }
  })

  it('gives every company a lounge of at least 6 x 5 m that the path grid reaches', () => {
    const { floor, lounges } = floorOf(buildLayout(seeded(), undefined))
    const grid = officeGrid(floor)
    // Company a has five agents, so its lounge is the first to grow past four seats.
    expect(lounges.map((lounge) => lounge.slots.length)).toEqual([8, 4, 4])
    for (const lounge of lounges) {
      expect(lounge.width).toBeGreaterThanOrEqual(6)
      expect(lounge.depth).toBeGreaterThanOrEqual(5)
      expect(lounge.slots.map((slot) => slot.id)).toEqual(
        lounge.slots.map((_, index) => `lounge_seat_${index}`)
      )
      for (const seat of lounge.slots) {
        expect(seat.heading).toBe(0)
        expect(isInside({ ...seat, width: 0.6, depth: 0.6 }, lounge)).toBe(true)
        expect(findPath(grid, floor.elevator, seat).length).toBeGreaterThan(0)
      }
    }
  })

  it('multiplies every length of the lounge by the factor agents grew by', () => {
    const S = FURNITURE_SCALE
    const times = (metres: number) => expect.closeTo(metres * S, 9)
    const [eight, four] = floorOf(buildLayout(seeded(), undefined)).lounges
    // 7.62 x 6.35 m for four seats and 7.62 x 8.88 m for eight; they were 6 x 5 and 6 x 7.
    expect([four.width, four.depth]).toEqual([times(6), times(5)])
    expect([eight.width, eight.depth]).toEqual([times(6), times(7)])
    const west = eight.x - eight.width / 2
    const north = eight.z - eight.depth / 2
    expect(eight.slots.slice(0, 4).map((seat) => seat.x - west)).toEqual(
      [1.125, 2.375, 3.625, 4.875].map(times)
    )
    // Company a is south of the street: 2 m behind the first row, 2 m a row, 3 m in front.
    expect(eight.slots[0].z - north).toEqual(times(2))
    expect(eight.slots[4].z - eight.slots[0].z).toEqual(times(2))
    expect(north + eight.depth - eight.slots[4].z).toEqual(times(3))
  })

  it('moves nothing on the floor but what the larger lounge pushes', () => {
    // Measured before the lounge grew: each company's size, its projects' corners from its west
    // wall and its street side, and where every lead sits.
    const BEFORE = [
      { size: [46, 11], corners: [1.5, 15.5, 29.5], leads: [6, 11, 20, 25, 34], z: 8.3 },
      { size: [41, 11], corners: [1.5, 15.5, 24.5], leads: [6, 11, 20, 29], z: -5.7 },
      { size: [32, 11], corners: [1.5, 15.5], leads: [50, 55, 64], z: -5.7 }
    ]
    const { floor, companies } = floorOf(buildLayout(seeded(), undefined))
    // A lounge's plot is its size taken up to the half metre, so the grounds stay on the grid.
    const plot = (metres: number) => Math.ceil(metres * 2) / 2
    for (const [index, company] of companies.entries()) {
      const before = BEFORE[index]
      const west = company.x - company.width / 2
      expect(company.children.map((project) => project.x - project.width / 2 - west)).toEqual(
        before.corners
      )
      for (const project of company.children) {
        const streetSide = project.z - Math.sign(company.z) * (project.depth / 2)
        expect(Math.abs(streetSide - Math.sign(company.z) * 1.5)).toBe(1.5)
      }
      // The grounds gain what the lounge's plot gained: 2 m of width (8 from 6), and depth only
      // where the lounge is now deeper than every office.
      const lounge = company.lounge!
      const deepest = Math.max(plot(lounge.depth), ...company.children.map((p) => p.depth))
      expect(company.width).toBe(before.size[0] + plot(lounge.width) - 6)
      expect(company.depth).toBe(deepest + 3)
      expect([company.width - before.size[0], company.depth - before.size[1]]).toEqual(
        index === 0 ? [2, 1] : [2, 0]
      )
      const leads = floor.rooms
        .filter((room) => room.companyKey === company.companyKey && room.kind === 'office')
        .map((room) => room.slots.find((slot) => slot.id === 'desk_main')!)
      // Company c stands after b in its row: b's wider lounge moves it 2 m along, on the grid.
      const pushed = company.companyKey === 'c_c' ? 2 : 0
      expect(leads.map((seat) => [seat.x, seat.z])).toEqual(
        before.leads.map((x) => [x + pushed, before.z])
      )
    }
  })
})
