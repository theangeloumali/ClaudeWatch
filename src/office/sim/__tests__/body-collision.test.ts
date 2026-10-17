import { expect, it, vi } from 'vitest'
import { session, walkingAgent } from '../fixtures'
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
      walkingAgent(
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

// Every later arrival fades in at its own desk; a seat apart from every other.
function seatGap(world: World, agent: AgentView): number {
  const seat = world
    .layout()
    .floors[0].rooms.find((room) => room.id === agent.roomId)
    ?.slots.find((slot) => slot.id === agent.slotId)
  return seat ? Math.hypot(agent.x - seat.x, agent.z - seat.z) : Infinity
}

it('materialises simultaneous arrivals at their own desks, apart', () => {
  const world = emptyWorld()
  world.apply({
    type: 'patch',
    v: 1,
    seq: 1,
    upserts: [session('a'), session('b'), session('c')],
    removed: []
  })
  const arriving = world.step(0)
  expect(arriving.map((agent) => [agent.agentKey, agent.fade, seatGap(world, agent)])).toEqual([
    ['a', 0, 0],
    ['b', 0, 0],
    ['c', 0, 0]
  ])
  expectSeparated(arriving)
  for (let tick = 0; tick < 6; tick++) expectSeparated(world.step(100))
  expect(world.step(0).map((agent) => agent.fade)).toEqual([undefined, undefined, undefined])
})

it('updates a materialising worker and drops one removed before it settles', () => {
  const world = emptyWorld()
  world.apply({
    type: 'patch',
    v: 1,
    seq: 1,
    upserts: ['a', 'b', 'c'].map((key) => session(key)),
    removed: []
  })
  world.step(100)
  world.apply({
    type: 'patch',
    v: 1,
    seq: 2,
    upserts: [{ ...session('b'), activity: 'editing', attention: 'question' }],
    removed: ['c']
  })
  for (let tick = 0; tick < 6; tick++) expectSeparated(world.step(100))
  const bodies = world.step(0)
  expect(bodies.map((agent) => agent.agentKey)).toEqual(['a', 'b'])
  expect(bodies[1]).toMatchObject({ activity: 'editing', attention: 'question' })
  expect(bodies.every((agent) => agent.fade === undefined && seatGap(world, agent) === 0)).toBe(
    true
  )
})

it('materialises sixty arrivals on their rightful seats without overlapping a tick', () => {
  const world = emptyWorld()
  const arrivals = Array.from({ length: 60 }, (_, index) => ({
    ...session(`s${index}`, `p_${index % 12}`),
    companyKey: `c_${index % 4}`,
    companyLabel: `Company ${index % 4}`
  }))
  world.apply({ type: 'patch', v: 1, seq: 1, upserts: arrivals, removed: [] })
  const seats = new Map(
    placements(arrivals, world.layout()).map((placement) => [placement.session.key, placement.slot])
  )
  let agents = world.step(0)
  expect(agents).toHaveLength(60)
  for (let tick = 0; tick < 6; tick++) {
    expectSeparated(agents)
    agents = world.step(100)
  }
  expect(
    agents.filter((agent) => {
      const seat = seats.get(agent.agentKey)!
      return agent.fade !== undefined || agent.x !== seat.x || agent.z !== seat.z
    })
  ).toEqual([])
})

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

it('seats past an obstacle with its own id, and holds still beside a player on its seat', () => {
  const world = emptyWorld()
  world.setBodyObstacles([{ id: 'a', x: 0, z: 0, radius: 10 }])
  world.apply({ type: 'patch', v: 1, seq: 1, upserts: [session('a')], removed: [] })
  for (let tick = 0; tick < 6; tick++) world.step(100)
  const before = world.step(0)[0]
  expect({ fade: before.fade, gap: seatGap(world, before) }).toEqual({ fade: undefined, gap: 0 })
  world.setBodyObstacles([{ id: 'player', x: before.x, z: before.z, radius: 0.55 }])
  expect(world.step(100)[0]).toMatchObject({ x: before.x, z: before.z })
  world.setBodyObstacles([])
  world.apply({ type: 'patch', v: 1, seq: 2, upserts: [], removed: ['a'] })
  for (let tick = 0; tick < 6; tick++) world.step(100)
  expect(world.step(0)).toEqual([])
  world.apply({ type: 'patch', v: 1, seq: 3, upserts: [session('b')], removed: [] })
  const arrival = world.step(0)[0]
  expect({ key: arrival.agentKey, gap: seatGap(world, arrival) }).toEqual({ key: 'b', gap: 0 })
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
