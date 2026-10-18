import { expect, it, vi } from 'vitest'
import { World } from './world'
import { session } from './fixtures'

// An office that was open and empty when session `a` started, so `a` fades in at its desk.
function world() {
  const world = new World()
  world.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 0, generatedAtMs: 0, sessions: [], sources: [] }
  })
  world.apply({ type: 'patch', v: 1, seq: 1, upserts: [session('a')], removed: [] })
  return world
}
it('keeps applying later messages after one it could not place', () => {
  const sim = world()
  // A session the feed sent malformed: its placement throws.
  const broken = { ...session('x'), subagents: null } as unknown as ReturnType<typeof session>
  expect(() => sim.apply({ type: 'patch', v: 1, seq: 2, upserts: [broken], removed: [] })).toThrow()
  // Nothing of the bad message was kept, so the next one places as if it never came.
  expect(() =>
    sim.apply({ type: 'patch', v: 1, seq: 3, upserts: [session('b')], removed: [] })
  ).not.toThrow()
  expect(sim.step(0).map((agent) => agent.agentKey)).toEqual(['a', 'b'])
  expect(sim.layout().floors[0].rooms.map((room) => room.sessionKey)).toEqual(['a', 'b'])
  for (let tick = 0; tick < 1000; tick++) sim.step(100)
  expect(sim.step(0).map((agent) => agent.agentKey)).toEqual(['a', 'b'])
})
it('reads a saved map only for order and bays, never as the floor it moves agents from', () => {
  const first = new World()
  const hello = {
    type: 'hello' as const,
    v: 1 as const,
    snapshot: { rev: 1, generatedAtMs: 0, sessions: [session('a')], sources: [] }
  }
  first.apply(hello)
  const saved = first.layout()
  // Storage only vouches for the outline; what is inside a saved room is not to be trusted.
  saved.floors[0].rooms = saved.floors[0].rooms.map(
    (room) => ({ ...room, slots: null }) as unknown as (typeof saved.floors)[0]['rooms'][0]
  )
  const sim = new World({ saved })
  expect(() => sim.apply(hello)).not.toThrow()
  expect(sim.step(0).map((agent) => agent.agentKey)).toEqual(['a'])
})
it('seats the sessions that were already running when the office opens', () => {
  const sim = new World()
  sim.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 1, generatedAtMs: 0, sessions: [session('a')], sources: [] }
  })
  const [seated] = sim.step(0)
  const seat = sim
    .layout()
    .floors[0].rooms.find((r) => r.sessionKey === 'a')!
    .slots.find((s) => s.id === 'desk_main')!
  expect(seated).toMatchObject({ x: seat.x, z: seat.z, heading: seat.heading })

  // A session that starts while the office is open fades in at its desk, not at the gate.
  sim.apply({ type: 'patch', v: 1, seq: 2, upserts: [session('b')], removed: [] })
  const desk = sim
    .layout()
    .floors[0].rooms.find((r) => r.sessionKey === 'b')!
    .slots.find((s) => s.id === 'desk_main')!
  expect(sim.step(0).find((a) => a.agentKey === 'b')).toMatchObject({
    x: desk.x,
    z: desk.z,
    fade: 0
  })
})
it('clamps a ten second delta to one second of walking', () => {
  const sim = new World()
  sim.apply({
    type: 'hello',
    v: 1,
    snapshot: {
      rev: 0,
      generatedAtMs: 0,
      sessions: [{ ...session('a'), attention: 'done' }],
      sources: []
    }
  })
  // A finished agent sets off for the lounge after the delay: a walker to clamp.
  let start = sim.step(0)[0]
  for (let i = 0; i < 400 && start.place !== 'lounge'; i++) start = sim.step(100)[0]
  const end = sim.step(10000)[0]
  const walked = Math.hypot(end.x - start.x, end.z - start.z)
  expect({ isWalking: walked > 0, isClamped: walked <= 1.400001 }).toEqual({
    isWalking: true,
    isClamped: true
  })
})
it('fades where it stands after removal and is gone within one fade', () => {
  const sim = world()
  for (let i = 0; i < 10; i++) sim.step(100)
  const seated = sim.step(0)[0]
  sim.apply({ type: 'patch', v: 1, seq: 2, upserts: [], removed: ['a'] })
  const leaving = sim.step(100)
  expect(leaving).toEqual([expect.objectContaining({ x: seated.x, z: seated.z, place: 'leaving' })])
  for (let i = 0; i < 5; i++) sim.step(100)
  expect(sim.step(0)).toEqual([])
})
it('creates distinct subagent views', () => {
  const sim = new World()
  const main = session('a')
  main.subagents = Array.from({ length: 6 }, (_, i) => ({
    id: String(i),
    type: 'worker',
    activity: 'reading'
  }))
  sim.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 0, generatedAtMs: 0, sessions: [main], sources: [] }
  })
  const guests = sim.step(0).filter((a) => a.isSubagent)
  expect(guests).toHaveLength(6)
  expect(guests.map((a) => a.agentKey)).toContain('a#5')
  expect(guests.filter((a) => a.slotId.startsWith('team_seat'))).toHaveLength(4)
})

it('uses fixed ticks and protects returned layout data', () => {
  const sim = world()
  const start = sim.step(0)
  expect(sim.step(99)).toEqual(start)
  expect(sim.step(1)).not.toEqual(start)
  const layout = sim.layout()
  layout.floors.length = 0
  expect(sim.layout().floors).toHaveLength(1)
})

it('applies the patch that follows the hello revision, then rejects duplicates and late ones', () => {
  const sim = new World()
  // A patch's seq is the snapshot revision it produces, so it continues from the hello.
  sim.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 1, generatedAtMs: 0, sessions: [session('a')], sources: [] }
  })
  expect(sim.revision()).toBe(1)
  sim.apply({
    type: 'patch',
    v: 1,
    seq: 2,
    upserts: [{ ...session('a'), attention: 'permission' }],
    removed: []
  })
  expect(sim.step(0)[0].attention).toBe('permission')
  for (const seq of [2, 1]) {
    sim.apply({ type: 'patch', v: 1, seq, upserts: [session('a')], removed: [] })
    expect(sim.step(0)[0].attention).toBe('permission')
  }
})

it('retains all 60 identities, each fading in at its own desk', () => {
  const sim = new World()
  const sessions = Array.from({ length: 60 }, (_, i) => ({
    ...session(`s${i}`, `p_${i % 12}`),
    companyKey: `c_${i % 4}`,
    companyLabel: `Company ${i % 4}`
  }))
  sim.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 1, generatedAtMs: 0, sessions: [], sources: [] }
  })
  sim.apply({ type: 'patch', v: 1, seq: 2, upserts: sessions, removed: [] })
  const arrivals = sim.step(0)
  expect(arrivals.map((agent) => agent.agentKey).sort()).toEqual(
    sessions.map((agent) => agent.key).sort()
  )
  expect(arrivals.every((view) => view.fade !== undefined)).toBe(true)
  for (const [index, view] of arrivals.entries()) {
    expect(view.floorId).toBe('hq')
    for (const other of arrivals.slice(index + 1))
      expect(Math.hypot(view.x - other.x, view.z - other.z)).toBeGreaterThanOrEqual(1.3 - 1e-8)
  }
})
it('keeps a subagent at its desk when a sibling finishes', () => {
  const sim = new World()
  const worker = (id: string) => ({ id, type: 'worker', activity: 'reading' as const })
  const main = { ...session('a'), subagents: ['0', '1', '2'].map(worker) }
  sim.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 0, generatedAtMs: 0, sessions: [main], sources: [] }
  })
  for (let i = 0; i < 1000; i++) sim.step(100)
  const before = sim.step(0).find((a) => a.agentKey === 'a#1')!
  expect(before.slotId).toBe('desk_guest_1')

  sim.apply({
    type: 'patch',
    v: 1,
    seq: 1,
    upserts: [{ ...main, subagents: ['1', '2'].map(worker) }],
    removed: []
  })
  const views = sim.step(0)
  const after = views.find((a) => a.agentKey === 'a#1')!
  expect(after).toMatchObject({ slotId: 'desk_guest_1', x: before.x, z: before.z })
  // The free guest desk goes to the subagent that was waiting in the team area.
  expect(views.find((a) => a.agentKey === 'a#2')!.slotId).toBe('desk_guest_0')
})

it('seats teammates like subagents, under their own names, and keeps their seats', () => {
  const sim = new World()
  const mate = (name: string) => ({
    id: `${name}@session-a`,
    type: 'lena',
    activity: 'thinking' as const,
    kind: 'teammate' as const,
    name
  })
  const worker = { id: 'abc', type: 'Explore', activity: 'reading' as const }
  const lead = { ...session('a'), subagents: [worker, ...['kai', 'lena', 'ravi'].map(mate)] }
  sim.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 0, generatedAtMs: 0, sessions: [lead], sources: [] }
  })
  const seats = () =>
    Object.fromEntries(
      sim
        .step(0)
        .filter((a) => a.isSubagent)
        .map((a) => [a.label, `${a.roomId}/${a.slotId}`])
    )
  const before = seats()
  expect(Object.keys(before).sort()).toEqual(['Explore', 'kai', 'lena', 'ravi'])
  expect(new Set(Object.values(before)).size).toBe(4)

  // Teammates take the desks beside their lead first: they stay, while subagents come and go.
  expect(before.kai).toContain('desk_guest')
  expect(before.lena).toContain('desk_guest')

  // The subagent leaves the team area; nobody else is moved, at a desk or in the team area.
  sim.apply({
    type: 'patch',
    v: 1,
    seq: 1,
    upserts: [{ ...lead, subagents: ['kai', 'lena', 'ravi'].map(mate) }],
    removed: []
  })
  const after = seats()
  for (const name of ['kai', 'lena', 'ravi']) expect(after[name]).toBe(before[name])
  expect(before.ravi).toContain('team_seat')
})

const seatOf = (sim: World, agent: { roomId: string; slotId: string }) => {
  const seat = sim
    .layout()
    .floors[0].rooms.find((r) => r.id === agent.roomId)!
    .slots.find((s) => s.id === agent.slotId)!
  return { x: seat.x, z: seat.z }
}

it('moves a seated team-area sitter with its seat when a desk row pushes the team area down', () => {
  const sim = new World()
  const worker = (id: string) => ({ id, type: 'worker', activity: 'reading' as const })
  const main = { ...session('a'), subagents: ['0', '1', '2'].map(worker) }
  sim.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 1, generatedAtMs: 0, sessions: [main], sources: [] }
  })
  for (let i = 0; i < 1500; i++) sim.step(100)
  const before = sim.step(0).find((a) => a.agentKey === 'a#2')!
  expect(before.slotId).toBe('team_seat_0')

  // A fifth session grows the project by a row, which pushes the team area down.
  const more = ['b', 'c', 'd', 'e'].map((key) => session(key))
  sim.apply({ type: 'patch', v: 1, seq: 2, upserts: more, removed: [] })
  const after = sim.step(0).find((a) => a.agentKey === 'a#2')!
  expect(sim.layout().floors[0].rooms.find((r) => r.id === after.roomId)!.z).toBeGreaterThan(
    before.z
  )
  expect(after.slotId).toBe('team_seat_0')
  // Seated, so it goes with its seat: it is never left standing where the seat used to be.
  expect({ x: after.x, z: after.z }).toEqual(seatOf(sim, after))
  expect(after.z).toBeGreaterThan(before.z)
})
it('never leaves a team-area sitter where a new office is built over its old seat', () => {
  const sim = new World()
  const worker = (id: string) => ({ id: `s${id}`, type: 'worker', activity: 'reading' as const })
  const busy = { ...session('a'), subagents: ['0', '1', '2', '3'].map(worker) }
  sim.apply({
    type: 'hello',
    v: 1,
    snapshot: {
      rev: 1,
      generatedAtMs: 0,
      sessions: [busy, session('b'), session('c'), session('d')],
      sources: []
    }
  })
  const before = sim.step(0).find((a) => a.agentKey === 'a#s3')!
  sim.apply({ type: 'patch', v: 1, seq: 2, upserts: [session('e')], removed: [] })
  const after = sim.step(0).find((a) => a.agentKey === 'a#s3')!
  expect({ x: after.x, z: after.z }).toEqual(seatOf(sim, after))
  expect({ x: after.x, z: after.z }).not.toEqual({ x: before.x, z: before.z })
})
it('keeps a seated agent at its desk when the floor shrinks and its company slides over', () => {
  const sim = new World()
  const neighbours = Array.from({ length: 4 }, (_, index) => ({
    ...session(`n${index}`, `p_n${index}`),
    companyKey: `c_${index}`,
    companyLabel: `Neighbour ${index}`
  }))
  sim.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 1, generatedAtMs: 0, sessions: [session('a'), ...neighbours], sources: [] }
  })
  const before = sim.step(0).find((a) => a.agentKey === 'a')!
  const gone = neighbours.map((neighbour) => neighbour.key)
  sim.apply({ type: 'patch', v: 1, seq: 2, upserts: [], removed: gone })
  const after = sim.step(0).find((a) => a.agentKey === 'a')!
  expect(Math.abs(before.x)).toBeGreaterThan(sim.layout().floors[0].width / 2)
  expect({ x: after.x, z: after.z }).toEqual(seatOf(sim, after))
})
it('brings a new arrival to rest exactly on its seat', () => {
  const sim = world()
  for (let i = 0; i < 2000; i++) sim.step(100)
  const [arrived] = sim.step(0)
  const seat = sim
    .layout()
    .floors[0].rooms.find((r) => r.sessionKey === 'a')!
    .slots.find((s) => s.id === 'desk_main')!
  expect({ x: arrived.x, z: arrived.z }).toEqual({ x: seat.x, z: seat.z })
})
it('keeps a fading leaver at its desk when its session returns', () => {
  const sim = new World()
  const hello = (rev: number, sessions: ReturnType<typeof session>[]) =>
    sim.apply({ type: 'hello', v: 1, snapshot: { rev, generatedAtMs: 0, sessions, sources: [] } })
  hello(1, [session('a')])
  sim.apply({ type: 'patch', v: 1, seq: 2, upserts: [], removed: ['a'] })
  for (let i = 0; i < 2; i++) sim.step(100)
  expect(sim.step(0)[0]).toMatchObject({ place: 'leaving' })

  // The bridge restarts and the session is there again.
  sim.apply({ type: 'resync' })
  hello(1, [session('a')])
  for (let i = 0; i < 6; i++) sim.step(100)
  const seat = sim
    .layout()
    .floors[0].rooms.find((r) => r.sessionKey === 'a')!
    .slots.find((s) => s.id === 'desk_main')!
  const back = sim.step(0)
  expect(back).toHaveLength(1)
  expect(back[0]).toMatchObject({ x: seat.x, z: seat.z })
  expect({ place: back[0].place, fade: back[0].fade }).toEqual({
    place: undefined,
    fade: undefined
  })
})

// Each floor is serialised once per reconcile: the routes' change check is the lounges' too.
it('serialises each floor once when a patch is applied', () => {
  const sim = world()
  const stringify = vi.spyOn(JSON, 'stringify')
  sim.apply({
    type: 'patch',
    v: 1,
    seq: 2,
    upserts: [{ ...session('a'), activity: 'thinking' }],
    removed: []
  })
  const isFloor = (value: unknown) =>
    typeof value === 'object' && value !== null && 'zones' in value
  const floorCalls = stringify.mock.calls.filter(
    ([value]) => isFloor(value) || (Array.isArray(value) && value.some(isFloor))
  )
  stringify.mockRestore()
  expect(floorCalls).toHaveLength(sim.layout().floors.length)
})
