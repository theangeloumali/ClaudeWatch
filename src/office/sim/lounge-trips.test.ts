import { expect, it } from 'vitest'
import type { AgentView, SessionRef, SubagentRef } from '../../shared/office/types'
import { LOUNGE_DELAY_MS } from './behaviour'
import { session } from './fixtures'
import { World } from './world'

const DELAY_S = LOUNGE_DELAY_MS / 1000
// Longer than any walk on these small floors.
const SETTLE_S = 120

const done = (key: string, project?: string): SessionRef => ({
  ...session(key, project),
  attention: 'done'
})
function open(sessions: SessionRef[]): World {
  const sim = new World()
  sim.apply({ type: 'hello', v: 1, snapshot: { rev: 0, generatedAtMs: 0, sessions, sources: [] } })
  return sim
}
let seq = 0
const patch = (sim: World, upserts: SessionRef[], removed: string[] = []) =>
  sim.apply({ type: 'patch', v: 1, seq: ++seq, upserts, removed })
// Every frame on the way, so a test can check the whole walk.
const run = (sim: World, seconds: number): AgentView[][] =>
  Array.from({ length: Math.round(seconds * 10) }, () => sim.step(100))
const view = (sim: World, key: string) => sim.step(0).find((a) => a.agentKey === key)!
const seat = (sim: World, index: number) =>
  sim.layout().floors[0].zones.find((zone) => zone.companyKey === 'c_work')!.lounge!.slots[index]
const officeOf = (sim: World, key: string) =>
  sim.layout().floors[0].rooms.find((r) => r.sessionKey === key)!
const deskOf = (sim: World, key: string) =>
  officeOf(sim, key).slots.find((s) => s.id === 'desk_main')!
const at = ({ x, z }: { x: number; z: number }) => ({ x, z })

it('walks a finished agent to the lowest free seat after the delay, and keeps its desk', () => {
  // Already done when the office opens: it starts at its desk like any other.
  const sim = open([done('a')])
  run(sim, DELAY_S - 0.1)
  expect(at(view(sim, 'a'))).toEqual(at(deskOf(sim, 'a')))
  expect(view(sim, 'a').place).toBeUndefined()

  run(sim, 0.1)
  expect(view(sim, 'a').place).toBe('lounge')
  run(sim, SETTLE_S)
  expect(view(sim, 'a')).toMatchObject({
    ...at(seat(sim, 0)),
    heading: seat(sim, 0).heading,
    place: 'lounge',
    roomId: officeOf(sim, 'a').id,
    slotId: 'desk_main'
  })
})

it('leaves a working agent at its desk', () => {
  const sim = open([session('a')])
  for (const views of run(sim, DELAY_S * 3)) {
    expect(views[0].place).toBeUndefined()
    expect(at(views[0])).toEqual(at(deskOf(sim, 'a')))
  }
})

it('walks back to its own desk when it works again', () => {
  const sim = open([done('a')])
  run(sim, SETTLE_S)
  patch(sim, [session('a')])
  expect(view(sim, 'a').place).toBeUndefined()
  expect(at(view(sim, 'a'))).toEqual(at(seat(sim, 0)))
  run(sim, SETTLE_S)
  expect(view(sim, 'a')).toMatchObject({
    ...at(deskOf(sim, 'a')),
    heading: deskOf(sim, 'a').heading,
    slotId: 'desk_main'
  })

  // Done again later: the wait starts over.
  patch(sim, [done('a')])
  run(sim, DELAY_S - 0.1)
  expect(view(sim, 'a').place).toBeUndefined()
})

it.each(['permission', 'question', 'error', 'limited'] as const)(
  'never leaves an agent with %s in the lounge',
  (attention) => {
    const sim = open([done('a')])
    // Caught on the way there.
    run(sim, DELAY_S + 2)
    expect(view(sim, 'a').place).toBe('lounge')
    patch(sim, [{ ...session('a'), attention }])
    for (const views of [sim.step(0), ...run(sim, SETTLE_S)]) expect(views[0].place).toBeUndefined()
    expect(at(view(sim, 'a'))).toEqual(at(deskOf(sim, 'a')))
  }
)

it('gives two agents that set off in the same tick different seats', () => {
  const sim = open([done('a'), done('b')])
  run(sim, DELAY_S)
  expect(sim.step(0).map((a) => a.place)).toEqual(['lounge', 'lounge'])
  run(sim, SETTLE_S)
  expect(at(view(sim, 'a'))).toEqual(at(seat(sim, 0)))
  expect(at(view(sim, 'b'))).toEqual(at(seat(sim, 1)))
})

it('sends an idle guest to the lounge and back, and leaves the busy ones', () => {
  const mate = (name: string, activity: SubagentRef['activity']): SubagentRef => ({
    id: name,
    type: 'lena',
    kind: 'teammate',
    name,
    activity
  })
  const lead = (activity: SubagentRef['activity']): SessionRef => ({
    ...session('a'),
    activity: 'thinking',
    subagents: [mate('quiet', activity), mate('busy', 'editing')]
  })
  const sim = open([lead('idle')])
  const desk = view(sim, 'a#quiet')
  run(sim, DELAY_S + SETTLE_S)
  expect(view(sim, 'a#quiet')).toMatchObject({
    ...at(seat(sim, 0)),
    place: 'lounge',
    roomId: desk.roomId,
    slotId: desk.slotId
  })
  expect(view(sim, 'a#busy').place).toBeUndefined()
  expect(view(sim, 'a').place).toBeUndefined()

  patch(sim, [lead('reading')])
  expect(view(sim, 'a#quiet').place).toBeUndefined()
  run(sim, SETTLE_S)
  expect(at(view(sim, 'a#quiet'))).toEqual(at(desk))
})

// An earlier project in the same company: each desk column it gains pushes what stands after it.
const mates = (count: number): SessionRef[] =>
  Array.from({ length: count }, (_, index) => session(`m${index}`, 'p_0'))
// Other companies beside this one: when they all go, the floor shrinks from under it.
const neighbours = (count: number): SessionRef[] =>
  Array.from({ length: count }, (_, index) => ({
    ...session(`n${index}`, `p_n${index}`),
    companyKey: `c_${index}`,
    companyLabel: `Neighbour ${index}`
  }))

it.each([
  { when: 'seated as its company grows', seconds: SETTLE_S, others: mates, before: 1, after: 3 },
  {
    when: 'on its way as its company grows',
    seconds: DELAY_S + 2,
    others: mates,
    before: 1,
    after: 3
  }
])('walks to its moved seat from where it stands, $when', ({ seconds, others, before, after }) => {
  const sim = open([done('a'), ...others(before)])
  run(sim, seconds)
  const was = view(sim, 'a')
  const oldSeat = seat(sim, 0)
  patch(
    sim,
    others(after).slice(before),
    others(before)
      .slice(after)
      .map((gone) => gone.key)
  )
  expect(at(seat(sim, 0))).not.toEqual(at(oldSeat))
  expect(view(sim, 'a')).toMatchObject({ ...at(was), place: 'lounge' })

  // No jump: each tick moves it at walking pace.
  let last = at(was)
  for (const views of run(sim, SETTLE_S)) {
    const now = at(views.find((a) => a.agentKey === 'a')!)
    expect(Math.hypot(now.x - last.x, now.z - last.z)).toBeLessThanOrEqual(0.1401)
    last = now
  }
  expect(view(sim, 'a')).toMatchObject({ ...at(seat(sim, 0)), place: 'lounge' })
})

// The smaller floor's path grid no longer reaches where it sits, so no walk can get it out.
it('fades home and walks back to its moved seat when the floor shrinks from under it', () => {
  const sim = open([done('a'), ...neighbours(4)])
  run(sim, SETTLE_S)
  const oldSeat = seat(sim, 0)
  expect(view(sim, 'a')).toMatchObject({ ...at(oldSeat), place: 'lounge' })
  patch(
    sim,
    [],
    neighbours(4).map((gone) => gone.key)
  )
  expect(at(seat(sim, 0))).not.toEqual(at(oldSeat))
  let last = view(sim, 'a')
  let hasFaded = false
  for (const views of run(sim, SETTLE_S)) {
    const now = views.find((a) => a.agentKey === 'a')!
    hasFaded ||= now.fade !== undefined
    // Only a visible body walks; one fading across may appear somewhere new.
    if (last.fade === undefined && now.fade === undefined)
      expect(Math.hypot(now.x - last.x, now.z - last.z)).toBeLessThanOrEqual(0.1401)
    last = now
  }
  expect({ hasFaded, ...at(view(sim, 'a')), place: view(sim, 'a').place }).toEqual({
    hasFaded: true,
    ...at(seat(sim, 0)),
    place: 'lounge'
  })
})

it('retains finished eligibility after an off/on setting cycle and walks each leg', () => {
  const sim = open([done('a')])
  run(sim, SETTLE_S)
  sim.setLoungeTrips(false)
  run(sim, SETTLE_S)
  expect(view(sim, 'a')).toMatchObject(at(deskOf(sim, 'a')))
  expect(view(sim, 'a').place).toBeUndefined()

  sim.setLoungeTrips(true)
  sim.step(100)
  expect(view(sim, 'a')).toMatchObject({ ...at(deskOf(sim, 'a')), place: 'lounge' })
  run(sim, SETTLE_S)
  expect(view(sim, 'a')).toMatchObject({ ...at(seat(sim, 0)), place: 'lounge' })
})

it('walks back to a desk that moved while it was in the lounge', () => {
  // The earlier project gains desk columns, which pushes this agent's own office along.
  const sim = open([done('a'), ...mates(1)])
  run(sim, SETTLE_S)
  const oldDesk = deskOf(sim, 'a')
  patch(sim, [session('a'), ...mates(4).slice(1)])
  expect(at(deskOf(sim, 'a'))).not.toEqual(at(oldDesk))
  run(sim, SETTLE_S * 2)
  expect(view(sim, 'a')).toMatchObject({ ...at(deskOf(sim, 'a')), roomId: officeOf(sim, 'a').id })
  expect(view(sim, 'a').place).toBeUndefined()
})

it('fades where it sits when its session ends in the lounge', () => {
  const sim = open([done('a'), session('b')])
  run(sim, SETTLE_S)
  const lounging = view(sim, 'a')
  expect(lounging.place).toBe('lounge')
  patch(sim, [], ['a'])
  expect(view(sim, 'a')).toMatchObject({ ...at(lounging), place: 'leaving' })

  const fade = run(sim, 0.6).flatMap((views) => views.filter((a) => a.agentKey === 'a'))
  expect(fade.every((step) => step.x === lounging.x && step.z === lounging.z)).toBe(true)
  expect(sim.step(0).map((a) => a.agentKey)).toEqual(['b'])
})

function openWithoutTrips(sessions: SessionRef[]): World {
  const sim = new World({ loungeTrips: false })
  sim.apply({ type: 'hello', v: 1, snapshot: { rev: 0, generatedAtMs: 0, sessions, sources: [] } })
  return sim
}

it('keeps a finished agent at its desk when lounge trips are off', () => {
  const sim = openWithoutTrips([done('a')])
  for (const views of run(sim, DELAY_S * 3)) {
    expect(views[0].place).toBeUndefined()
    expect(at(views[0])).toEqual(at(deskOf(sim, 'a')))
  }
})

it('walks an agent back from the lounge when lounge trips are turned off', () => {
  const sim = open([done('a')])
  run(sim, SETTLE_S)
  expect(view(sim, 'a')).toMatchObject({ ...at(seat(sim, 0)), place: 'lounge' })

  sim.setLoungeTrips(false)
  // It gets up at the next tick and walks: no jump to its desk.
  let last = at(view(sim, 'a'))
  for (const views of run(sim, SETTLE_S)) {
    expect(views[0].place).toBeUndefined()
    const now = at(views[0])
    expect(Math.hypot(now.x - last.x, now.z - last.z)).toBeLessThanOrEqual(0.1401)
    last = now
  }
  expect(view(sim, 'a')).toMatchObject({
    ...at(deskOf(sim, 'a')),
    heading: deskOf(sim, 'a').heading
  })
})

it('sends a finished agent to the lounge again once lounge trips are back on', () => {
  const sim = openWithoutTrips([done('a')])
  run(sim, DELAY_S * 2)
  sim.setLoungeTrips(true)
  run(sim, SETTLE_S)
  expect(view(sim, 'a')).toMatchObject({ ...at(seat(sim, 0)), place: 'lounge' })
})
