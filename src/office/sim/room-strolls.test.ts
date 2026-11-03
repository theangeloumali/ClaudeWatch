import { describe, expect, it } from 'vitest'
import { createWorldDocument } from '../../shared/office/world-document'
import { DEPARTURE_FADE_MS, type AgentView, type SessionRef } from '../../shared/office/types'
import { resolveEffectiveWorld } from './effective-world'
import { session, subagent } from './fixtures'
import { buildLayout } from './layout'
import { World } from './world'

const DOOR_CLEAR_METRES = 2
const SETTLE_S = 120

let seq = 0
function open(sessions: SessionRef[], options: ConstructorParameters<typeof World>[0] = {}) {
  const sim = new World(options)
  sim.apply({ type: 'hello', v: 1, snapshot: { rev: 0, generatedAtMs: 0, sessions, sources: [] } })
  return sim
}
const patch = (sim: World, upserts: SessionRef[]) =>
  sim.apply({ type: 'patch', v: 1, seq: ++seq, upserts, removed: [] })
const run = (sim: World, seconds: number) =>
  Array.from({ length: Math.round(seconds * 10) }, () => sim.step(100))
const view = (sim: World, key: string) => sim.step(0).find((a) => a.agentKey === key)!
const roomOf = (sim: World, agent: AgentView) =>
  sim
    .layout()
    .floors.find((floor) => floor.id === agent.floorId)!
    .rooms.find((room) => room.id === agent.roomId)!
const deskOf = (sim: World, agent: AgentView) =>
  roomOf(sim, agent).slots.find((slot) => slot.id === agent.slotId)!
const at = (point: { x: number; z: number }) => ({
  x: Number(point.x.toFixed(2)),
  z: Number(point.z.toFixed(2))
})
const doorDistance = (sim: World, agent: AgentView) => {
  const { door } = roomOf(sim, agent)
  return Math.hypot(agent.x - door.x, agent.z - door.z)
}
const isInside = (sim: World, agent: AgentView) => {
  const room = roomOf(sim, agent)
  return (
    Math.abs(agent.x - room.x) <= room.width / 2 && Math.abs(agent.z - room.z) <= room.depth / 2
  )
}

// Steps until `key` is out on a stroll, or fails after `seconds`.
function untilStroll(sim: World, key: string, seconds = SETTLE_S): AgentView {
  for (let tick = 0; tick < seconds * 10; tick++) {
    const agent = sim.step(100).find((a) => a.agentKey === key)!
    if (agent.place === 'stroll') return agent
  }
  throw new Error(`${key} never strolled`)
}

function expectStrollersClearOfDoor(sim: World, seconds: number) {
  let strollTicks = 0
  for (const [tick, views] of run(sim, seconds).entries())
    for (const agent of views.filter((candidate) => candidate.place === 'stroll')) {
      strollTicks++
      const distance = doorDistance(sim, agent)
      // A desk inside the door zone (Campus has some) only lets its stroller walk away from it.
      const limit = Math.min(
        DOOR_CLEAR_METRES,
        doorDistance(sim, { ...agent, ...deskOf(sim, agent) })
      )
      if (distance < limit - 1e-6)
        throw new Error(
          `${agent.agentKey} at tick ${tick} is ${distance.toFixed(2)} m from the door`
        )
    }
  expect(strollTicks).toBeGreaterThan(0)
}

const withSubagents = (count: number): SessionRef => ({
  ...session('a'),
  subagents: Array.from({ length: count }, (_, index) => subagent(`s${index}`))
})

describe('room strolls', () => {
  it('walks an idle agent inside its own room, never toward the door, and back to its desk', () => {
    const sim = open([session('a')])
    const desk = deskOf(sim, view(sim, 'a'))
    const startDoor = doorDistance(sim, view(sim, 'a'))
    const frames = run(sim, SETTLE_S).map((views) => views[0])
    const out = frames.filter((agent) => agent.place === 'stroll')
    expect(out.length).toBeGreaterThan(0)
    for (const agent of frames) {
      expect(isInside(sim, agent)).toBe(true)
      expect(doorDistance(sim, agent)).toBeGreaterThanOrEqual(
        Math.min(DOOR_CLEAR_METRES, startDoor) - 1e-6
      )
    }
    const spot = out.at(-1)!
    expect(doorDistance(sim, spot)).toBeGreaterThanOrEqual(DOOR_CLEAR_METRES)
    expect(at(spot)).not.toEqual(at(desk))
    const back = frames.slice(frames.lastIndexOf(spot) + 1)
    expect(back.some((agent) => agent.place === undefined)).toBe(true)
    run(sim, 20)
    expect(at(view(sim, 'a'))).toEqual(at(desk))
  })

  it('dwells at its spot for five to twelve seconds', () => {
    const sim = open([session('a')])
    untilStroll(sim, 'a')
    const frames = run(sim, 30).map((views) => views[0])
    const dwell = frames.filter(
      (agent, index) =>
        agent.place === 'stroll' && index > 0 && at(agent).x === at(frames[index - 1]).x
    )
    expect(dwell.length).toBeGreaterThanOrEqual(50)
    expect(dwell.length).toBeLessThanOrEqual(121)
  })

  it('strolls a working agent out within two minutes too', () => {
    const sim = open([{ ...session('a'), activity: 'editing' }])
    expect(untilStroll(sim, 'a', 125).place).toBe('stroll')
  })

  it('schedules the same strolls for the same agent', () => {
    const trace = () => {
      const sim = open([session('a'), session('b')])
      return run(sim, SETTLE_S).map((views) => views.map((a) => [a.place, at(a)]))
    }
    const first = trace()
    expect(first.flat().some(([place]) => place === 'stroll')).toBe(true)
    expect(trace()).toEqual(first)
  })

  it.each(['permission', 'question', 'error', 'limited'] as const)(
    'never strolls an agent with %s',
    (attention) => {
      const sim = open([{ ...session('a'), attention }])
      for (const views of run(sim, SETTLE_S)) expect(views[0].place).toBeUndefined()
    }
  )

  it('calls a stroller home the moment it needs you', () => {
    const sim = open([session('a')])
    const desk = deskOf(sim, view(sim, 'a'))
    untilStroll(sim, 'a')
    patch(sim, [{ ...session('a'), attention: 'permission' }])
    run(sim, 0.1)
    expect(view(sim, 'a').place).toBeUndefined()
    run(sim, 20)
    expect(at(view(sim, 'a'))).toEqual(at(desk))
  })

  it('never strolls with lounge trips off', () => {
    const sim = open([session('a')], { loungeTrips: false })
    for (const views of run(sim, SETTLE_S)) expect(views[0].place).toBeUndefined()
  })

  it('calls strollers home when lounge trips switch off', () => {
    const sim = open([session('a')])
    const desk = deskOf(sim, view(sim, 'a'))
    untilStroll(sim, 'a')
    sim.setLoungeTrips(false)
    run(sim, 0.1)
    expect(view(sim, 'a').place).toBeUndefined()
    for (const views of run(sim, SETTLE_S)) expect(views[0].place).toBeUndefined()
    expect(at(view(sim, 'a'))).toEqual(at(desk))
  })

  it('keeps a stroller out when a patch leaves its desk where it is', () => {
    const sim = open([session('a')])
    untilStroll(sim, 'a')
    patch(sim, [{ ...session('a'), activity: 'editing' }])
    expect(view(sim, 'a').place).toBe('stroll')
  })

  it('sends a stroller to its new desk when the layout moves it', () => {
    const sim = open([session('a')])
    untilStroll(sim, 'a')
    patch(sim, [session('a', 'p_b')])
    expect(view(sim, 'a').place).toBeUndefined()
    const desk = deskOf(sim, view(sim, 'a'))
    const frames = run(sim, 40).map((views) => views[0])
    expect(
      frames.some(
        (agent) =>
          agent.place === undefined && at(agent).x === at(desk).x && at(agent).z === at(desk).z
      )
    ).toBe(true)
  })

  it('keeps at most a third of each room away and sets out one stroller per tick', () => {
    const sim = open([withSubagents(6)])
    let previous = sim.step(0)
    let mostAway = 0
    for (const views of run(sim, SETTLE_S * 2)) {
      for (const roomId of new Set(views.map((agent) => agent.roomId))) {
        const members = views.filter((agent) => agent.roomId === roomId)
        const away = members.filter((a) => a.place === 'stroll' || a.place === 'lounge').length
        expect(away).toBeLessThanOrEqual(Math.ceil(members.length / 3))
        mostAway = Math.max(mostAway, away)
      }
      const setOut = views.filter(
        (agent, index) => agent.place === 'stroll' && previous[index]?.place !== 'stroll'
      )
      expect(setOut.length).toBeLessThanOrEqual(1)
      previous = views
    }
    // The cap is only tested if some room really had agents out.
    expect(mostAway).toBeGreaterThanOrEqual(1)
    expect(new Set(previous.map((agent) => agent.roomId)).size).toBeGreaterThan(1)
  })

  // Body avoidance shoves walkers off their planned route, so the door rule is checked per step.
  it.each([
    ['one agent and five subagents', [withSubagents(5)]],
    [
      'two agents with subagents',
      [withSubagents(3), { ...session('b'), subagents: [subagent('t0')] }]
    ]
  ])('keeps every stroller of a crowded room clear of its door: %s', (_label, sessions) => {
    expectStrollersClearOfDoor(open(sessions), 300)
  })

  it('keeps strollers clear of the door under the Campus layout', () => {
    const sessions = [withSubagents(5), session('b', 'p_b')]
    const document = createWorldDocument(buildLayout(sessions, undefined), sessions)
    const sim = open(sessions, {
      resolveLayout: (base, current) => resolveEffectiveWorld(base, document, current, 'campus')
    })
    expectStrollersClearOfDoor(sim, 300)
  })

  it('strolls an agent whose source cannot tell when its turn ends', () => {
    const observation = {
      sourceId: 's',
      observedAtMs: 0,
      staleAfterMs: 1e9,
      coverage: 'unknown' as const
    }
    const sim = open([{ ...session('a'), observation }])
    expect(untilStroll(sim, 'a').place).toBe('stroll')
  })

  it('drops the stroll clock of an agent removed mid-stroll', () => {
    const sim = open([session('a'), session('b')])
    untilStroll(sim, 'a')
    const clocks = sim['strolls']
    expect(clocks.has('a')).toBe(true)
    const before = clocks.size
    sim.apply({ type: 'patch', v: 1, seq: ++seq, upserts: [], removed: ['a'] })
    run(sim, DEPARTURE_FADE_MS / 1000 + 1)
    expect(sim.step(0).map((agent) => agent.agentKey)).toEqual(['b'])
    expect(clocks.has('a')).toBe(false)
    expect(clocks.size).toBe(before - 1)
  })

  it('still takes a finished agent to the game corner', () => {
    const sim = open([{ ...session('a'), attention: 'done' }])
    run(sim, SETTLE_S)
    expect(view(sim, 'a').place).toBe('lounge')
  })
})
