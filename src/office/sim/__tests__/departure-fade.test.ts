import { describe, expect, it, vi } from 'vitest'
import { SUBAGENT_BODY_RADIUS, WORKER_BODY_RADIUS } from '../../../shared/office/body-footprints'
import type { AgentView, SessionRef, SubagentRef } from '../../../shared/office/types'
import { createWorldDocument } from '../../../shared/office/world-document'
import { resolveEffectiveWorld } from '../effective-world'
import { session, subagent } from '../fixtures'
import type { LayoutMap } from '../layout'
import { World } from '../world'
import { TICK_MS } from './door-invariants'

// Full sim runs: the 5 s default times out under load (health-9).
vi.setConfig({ testTimeout: 60_000 })

const LEAD = 'claude:lead'

const resolveLayout = (base: LayoutMap, current: readonly SessionRef[]): LayoutMap =>
  resolveEffectiveWorld(base, createWorldDocument(base, current), current)

const member = (id: string, kind?: SubagentRef['kind']): SubagentRef => ({
  ...subagent(id, kind),
  activity: 'running'
})

function seatedWorld(members: SubagentRef[]) {
  const lead: SessionRef = { ...session(LEAD, 'p_app'), activity: 'running', subagents: members }
  const world = new World({ resolveLayout, loungeTrips: false, now: () => 0 })
  world.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 1, generatedAtMs: 0, sessions: [lead], sources: [] }
  })
  const office = world
    .layout()
    .floors.flatMap((floor) => floor.rooms)
    .find((room) => room.sessionKey === LEAD)!
  const door = office.slots.find((slot) => slot.id === 'door')!
  let sequence = 1
  const crew = (next: SubagentRef[]) =>
    world.apply({
      type: 'patch',
      v: 1,
      seq: ++sequence,
      removed: [],
      upserts: [{ ...lead, subagents: next }]
    })
  return { world, door, crew }
}

// Follows one agent tick by tick: how far it walked, its largest step, and its fade.
function follow(world: World, key: string, ticks: number) {
  let previous: AgentView | undefined
  let walked = 0
  let largestStep = 0
  let goneAtMs: number | null = null
  let firstFadeAtMs: number | null = null
  for (let tick = 1; tick <= ticks && goneAtMs === null; tick++) {
    const view = world.step(TICK_MS).find((candidate) => candidate.agentKey === key)
    if (!view) goneAtMs = tick * TICK_MS
    else {
      const step = previous ? Math.hypot(view.x - previous.x, view.z - previous.z) : 0
      walked += step
      largestStep = Math.max(largestStep, step)
      if (view.fade !== undefined && firstFadeAtMs === null) firstFadeAtMs = tick * TICK_MS
    }
    previous = view ?? previous
  }
  return { walked, largestStep, goneAtMs, firstFadeAtMs, last: previous }
}

describe('departures and arrivals: each fades where it stands', () => {
  it('fades a finished subagent at its desk within 1 s, never walking toward the lobby', () => {
    const { world, crew } = seatedWorld([member('helper')])
    crew([])
    const { walked, goneAtMs, firstFadeAtMs } = follow(world, `${LEAD}#helper`, 50)
    expect({ walked, isGoneWithinOneSecond: goneAtMs !== null && goneAtMs <= 1000 }).toEqual({
      walked: 0,
      isGoneWithinOneSecond: true
    })
    expect(firstFadeAtMs).not.toBeNull()
  })

  it('fades a finished teammate at its desk the same way', () => {
    const { world, crew } = seatedWorld([member('mate', 'teammate')])
    crew([])
    const { walked, goneAtMs, firstFadeAtMs } = follow(world, `${LEAD}#mate`, 40)
    expect({ walked, firstFadeAtMs, isGone: (goneAtMs ?? Infinity) <= 600 }).toEqual({
      walked: 0,
      firstFadeAtMs: 100,
      isGone: true
    })
  })

  it('marks every departing view as leaving (seating-5)', () => {
    const { world, crew } = seatedWorld([member('helper'), member('mate', 'teammate')])
    crew([])
    const marks = new Set<string | undefined>()
    for (let tick = 0; tick < 30; tick++)
      for (const view of world.step(TICK_MS)) if (view.agentKey !== LEAD) marks.add(view.place)
    expect([...marks]).toEqual(['leaving'])
  })

  it('fades a leaver at once, whatever stands in its office door', () => {
    const { world, door, crew } = seatedWorld([member('mate', 'teammate')])
    world.setBodyObstacles([{ id: 'player', x: door.x, z: door.z, elevation: 0, radius: 0.55 }])
    crew([])
    const { walked, goneAtMs, firstFadeAtMs } = follow(world, `${LEAD}#mate`, 300)
    expect({ walked, firstFadeAtMs, isGone: (goneAtMs ?? Infinity) <= 600 }).toEqual({
      walked: 0,
      firstFadeAtMs: 100,
      isGone: true
    })
  })

  it('forgets an arrival whose work ended before it got in', () => {
    const { world, crew } = seatedWorld([])
    crew(Array.from({ length: 6 }, (_, index) => member(`late-${index}`)))
    crew([])
    follow(world, LEAD, 10)
    expect({ agents: world['agents'].size, fading: world['fading'].size }).toEqual({
      agents: 1,
      fading: 0
    })
  })

  it('materialises an arriver at its desk, whatever stands in the office door', () => {
    const { world, door, crew } = seatedWorld([])
    world.setBodyObstacles([{ id: 'player', x: door.x, z: door.z, elevation: 0, radius: 0.55 }])
    crew([member('mate', 'teammate')])
    const first = world.step(0).find((view) => view.agentKey === `${LEAD}#mate`)
    const arrived = follow(world, `${LEAD}#mate`, 6)
    expect({
      isFadedAtFirst: first?.fade !== undefined,
      isAtDesk: deskGap(world, first) < 0.02,
      walked: arrived.walked,
      fade: arrived.last?.fade
    }).toEqual({ isFadedAtFirst: true, isAtDesk: true, walked: 0, fade: undefined })
  })

  it('keeps an arriver faded while a body stands on its desk, then seats it', () => {
    const { world, crew } = seatedWorld([])
    crew([member('mate', 'teammate')])
    const arriving = world.step(0).find((view) => view.agentKey === `${LEAD}#mate`)!
    world.setBodyObstacles([
      { id: 'player', x: arriving.x, z: arriving.z, elevation: 0, radius: 0.55 }
    ])
    const held = follow(world, `${LEAD}#mate`, 20)
    world.setBodyObstacles([])
    const seated = follow(world, `${LEAD}#mate`, 2)
    expect({ heldFade: held.last?.fade, seatedFade: seated.last?.fade }).toEqual({
      heldFade: expect.any(Number),
      seatedFade: undefined
    })
    expect(deskGap(world, seated.last)).toBeLessThan(0.02)
  })
})

describe('an arrival fading in is not yet a body', () => {
  it('lets a walker close in on its desk until it is seated', () => {
    const { world, crew } = seatedWorld([])
    crew([member('mate', 'teammate')])
    const mate = world.step(0).find((view) => view.agentKey === `${LEAD}#mate`)!
    const lead = world['agents'].get(LEAD)!
    const away = Math.hypot(lead.view.x - mate.x, lead.view.z - mate.z)
    // Staged 1.3 m out, just clear of a seated mate, and walking straight at its desk.
    const start = {
      x: mate.x + ((lead.view.x - mate.x) / away) * 1.3,
      z: mate.z + ((lead.view.z - mate.z) / away) * 1.3
    }
    world['agents'].set(LEAD, {
      ...lead,
      state: 'arriving',
      view: { ...lead.view, ...start },
      path: [{ x: mate.x, z: mate.z }]
    })
    let closest = Infinity
    for (let tick = 0; tick < 4; tick++) {
      const views = world.step(TICK_MS)
      const walker = views.find((view) => view.agentKey === LEAD)!
      expect(views.find((view) => view.agentKey === `${LEAD}#mate`)?.fade).toBeDefined()
      closest = Math.min(closest, Math.hypot(walker.x - mate.x, walker.z - mate.z))
    }
    expect(closest).toBeLessThan(WORKER_BODY_RADIUS + SUBAGENT_BODY_RADIUS - 0.3)
  })
})

function deskGap(world: World, view: AgentView | undefined): number {
  const seat = world
    .layout()
    .floors.flatMap((floor) => floor.rooms)
    .find((room) => room.id === view?.roomId)
    ?.slots.find((slot) => slot.id === view?.slotId)
  return view && seat ? Math.hypot(view.x - seat.x, view.z - seat.z) : Infinity
}
