import { expect, it, vi } from 'vitest'
import { session } from '../fixtures'
import { World } from '../world'
import { WORKER_BODY_RADIUS } from '../../../shared/office/body-footprints'
import type { AgentView } from '../../../shared/office/types'
import { createAgent, setFinished, tickAgent, updateAgent } from '../behaviour'
import { placements } from '../placements'

// Full sim or scene builds: the 5 s default times out under multi-agent load (health-9).
vi.setConfig({ testTimeout: 60_000 })

function expectSeparated(agents: AgentView[]): void {
  let minimum = Infinity
  for (let index = 0; index < agents.length; index++) {
    const agent = agents[index]
    if (!Number.isFinite(agent.x) || !Number.isFinite(agent.z))
      throw new Error(`Non-finite body: ${agent.agentKey}`)
    for (let otherIndex = index + 1; otherIndex < agents.length; otherIndex++) {
      const other = agents[otherIndex]
      minimum = Math.min(minimum, Math.hypot(agent.x - other.x, agent.z - other.z))
    }
  }
  expect(minimum).toBeGreaterThanOrEqual(WORKER_BODY_RADIUS * 2 - 1e-8)
}

function emptyWorld(): World {
  const world = new World({ loungeTrips: false })
  world.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 0, generatedAtMs: 0, sessions: [], sources: [] }
  })
  return world
}

it('advances activity dwell and finished timers while a body blocks movement', () => {
  const waiting = updateAgent(
    setFinished(
      createAgent(
        session('waiting'),
        { floorId: 'hq', roomId: 'room', slotId: 'desk_main', x: 2, z: 0, heading: 0 },
        [
          { x: 0, z: 0 },
          { x: 2, z: 0 }
        ]
      ),
      true
    ),
    'editing',
    'none'
  )
  let blocked = waiting
  for (let tick = 0; tick < 15; tick++) blocked = tickAgent(blocked, 100, (from) => from)
  expect(blocked.view).toMatchObject({ x: 0, z: 0, activity: 'editing' })
  expect(blocked.state).toBe('arriving')
  expect(blocked.path.at(-1)).toEqual({ x: 2, z: 0 })
  expect(blocked.finishedForMs).toBe(1500)
  expect(blocked.queued).toBeNull()
})

it('does not spawn simultaneous arrivals inside one another at the gate', () => {
  const world = new World({ loungeTrips: false })
  world.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 0, generatedAtMs: 0, sessions: [], sources: [] }
  })
  world.apply({
    type: 'patch',
    v: 1,
    seq: 1,
    upserts: [session('a'), session('b'), session('c')],
    removed: []
  })
  const agents = world.step(0)
  expect(agents).toHaveLength(1)
  expect(world['arrivals'].size).toBe(2)
  expectSeparated(agents)
  for (let tick = 0; tick < 1000; tick++) expectSeparated(world.step(100))
  expect(world['arrivals'].size).toBe(0)
  expect(world.step(0).map((agent) => agent.agentKey)).toEqual(['a', 'b', 'c'])
})

it('does not walk parallel arrivals through one another', () => {
  const world = new World({ loungeTrips: false })
  world.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 0, generatedAtMs: 0, sessions: [], sources: [] }
  })
  world.apply({ type: 'patch', v: 1, seq: 1, upserts: [session('a'), session('b')], removed: [] })
  let hasParallelBodies = false
  for (let tick = 0; tick < 1000; tick++) {
    const agents = world.step(100)
    expectSeparated(agents)
    expect([...agents.map((agent) => agent.agentKey), ...world['arrivals'].keys()].sort()).toEqual([
      'a',
      'b'
    ])
    hasParallelBodies ||= agents.length === 2
  }
  expect(hasParallelBodies).toBe(true)
})

it('updates queued worker claims and removes off-scene identities before admission', () => {
  const world = emptyWorld()
  world.apply({
    type: 'patch',
    v: 1,
    seq: 1,
    upserts: ['a', 'b', 'c'].map((key) => session(key)),
    removed: []
  })
  const [waiting, removed] = [...world['arrivals'].keys()]
  expect(world['arrivals'].size).toBe(2)
  world.apply({
    type: 'patch',
    v: 1,
    seq: 2,
    upserts: [{ ...session(waiting), activity: 'editing', attention: 'question' }],
    removed: [removed]
  })
  for (let tick = 0; tick < 1000; tick++) {
    const bodies = world.step(100)
    expectSeparated(bodies)
    const claims = [...bodies, ...[...world['arrivals'].values()].map((agent) => agent.view)]
    expect(claims).toHaveLength(2)
    expect(claims.some((agent) => agent.agentKey === removed)).toBe(false)
    expect(claims.find((agent) => agent.agentKey === waiting)).toMatchObject({
      activity: 'editing',
      attention: 'question'
    })
  }
  expect(world['arrivals'].size).toBe(0)
  expect(world.step(0)).toHaveLength(2)
})

it('settles sixty converging arrivals on their rightful seats without overlapping a tick', async () => {
  const world = emptyWorld()
  const arrivals = Array.from({ length: 60 }, (_, index) => ({
    ...session(`s${index}`, `p_${index % 12}`),
    companyKey: `c_${index % 4}`,
    companyLabel: `Company ${index % 4}`
  }))
  world.apply({ type: 'patch', v: 1, seq: 1, upserts: arrivals, removed: [] })
  expect(world.step(0)).toHaveLength(1)
  expect(world['arrivals'].size).toBe(59)
  expectSeparated(world.step(0))
  const floor = world.layout().floors[0]
  const seats = new Map(
    placements(arrivals, world.layout()).map((placement) => [placement.session.key, placement.slot])
  )
  const expectedKeys = arrivals.map((agent) => agent.key).sort()
  let settled = false
  let ticks = 0
  for (; ticks < 6000 && !settled; ticks++) {
    const agents = world.step(100)
    expectSeparated(agents)
    expect([...agents.map((agent) => agent.agentKey), ...world['arrivals'].keys()].sort()).toEqual(
      expectedKeys
    )
    settled =
      agents.length === arrivals.length &&
      world['arrivals'].size === 0 &&
      agents.every((agent) => {
        const seat = seats.get(agent.agentKey)!
        return agent.x === seat.x && agent.z === seat.z
      })
    if (ticks % 100 === 0) await new Promise<void>((resolve) => setImmediate(resolve))
  }
  expect(settled).toBe(true)
  expect(world.step(0)).toHaveLength(60)
  expectSeparated(world.step(1000))
  console.info(
    'Sixty body-separated arrivals reached every reserved seat after simulated seconds:',
    ticks / 10
  )
  for (const agent of world.step(0)) {
    const seat = floor.rooms
      .find((room) => room.id === agent.roomId)!
      .slots.find((slot) => slot.id === agent.slotId)!
    expect({ x: agent.x, z: agent.z }).toEqual({ x: seat.x, z: seat.z })
  }
}, 60_000)

it('clears all twenty removed workers instead of leaving one circling a wall corner', () => {
  const world = new World({ loungeTrips: false })
  const sessions = Array.from({ length: 20 }, (_, index) => session(`s${index}`))
  world.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 0, generatedAtMs: 0, sessions, sources: [] }
  })
  world.apply({
    type: 'patch',
    v: 1,
    seq: 1,
    upserts: [],
    removed: sessions.map((worker) => worker.key)
  })
  let remaining = world.step(0)
  for (let tick = 0; tick < 6000 && remaining.length; tick++) {
    remaining = world.step(100)
    expectSeparated(remaining)
  }
  expect(remaining.map((worker) => ({ key: worker.agentKey, x: worker.x, z: worker.z }))).toEqual(
    []
  )
})

it('clears external obstacles, excludes matching ids, and keeps the single arrival gate', () => {
  const world = emptyWorld()
  world.setBodyObstacles([{ id: 'a', x: 0, z: 0, radius: 10 }])
  world.apply({ type: 'patch', v: 1, seq: 1, upserts: [session('a')], removed: [] })
  expect(world.step(0)[0]).toMatchObject({ x: 0, z: 0 })
  world.setBodyObstacles([])
  for (let tick = 0; tick < 1000; tick++) world.step(100)
  const before = world.step(0)[0]
  world.setBodyObstacles([{ id: 'player', x: before.x, z: before.z, radius: 0.55 }])
  expect(world.step(100)[0]).toMatchObject({ x: before.x, z: before.z })
  world.setBodyObstacles([])
  world.apply({ type: 'patch', v: 1, seq: 2, upserts: [], removed: ['a'] })
  for (let tick = 0; tick < 1500; tick++) world.step(100)
  expect(world.step(0)).toEqual([])
  world.apply({ type: 'patch', v: 1, seq: 3, upserts: [session('b')], removed: [] })
  expect(world.step(0)[0]).toMatchObject({ agentKey: 'b', x: 0, z: 0 })
})

it('keeps crowded lounge trips and returners separated without losing seat ownership', () => {
  const world = new World()
  world.apply({
    type: 'hello',
    v: 1,
    snapshot: {
      rev: 0,
      generatedAtMs: 0,
      sessions: [session('a'), session('b')].map((agent) => ({ ...agent, attention: 'done' })),
      sources: []
    }
  })
  for (let tick = 0; tick < 2000; tick++) expectSeparated(world.step(100))
  expect(world.step(0).every((agent) => agent.place === 'lounge')).toBe(true)
  world.apply({ type: 'patch', v: 1, seq: 1, upserts: [session('a'), session('b')], removed: [] })
  for (let tick = 0; tick < 2000; tick++) expectSeparated(world.step(100))
  const floor = world.layout().floors[0]
  for (const agent of world.step(0)) {
    const seat = floor.rooms
      .find((room) => room.id === agent.roomId)!
      .slots.find((slot) => slot.id === agent.slotId)!
    expect(agent).toMatchObject({ x: seat.x, z: seat.z, slotId: 'desk_main' })
  }
})
