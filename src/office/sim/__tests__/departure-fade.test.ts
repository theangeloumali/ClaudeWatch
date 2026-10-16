import { describe, expect, it, vi } from 'vitest'
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
const MAX_STEP_METRES = 0.14 + 1e-6

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

describe('departures: fade at the desk, walk out, or fade when stuck', () => {
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

  it('still walks a finished teammate out, unfaded', () => {
    const { world, crew } = seatedWorld([member('mate', 'teammate')])
    crew([])
    const { walked, largestStep, firstFadeAtMs } = follow(world, `${LEAD}#mate`, 40)
    expect(walked).toBeGreaterThan(2)
    expect({ largestStep: largestStep <= MAX_STEP_METRES, firstFadeAtMs }).toEqual({
      largestStep: true,
      firstFadeAtMs: null
    })
  })

  it('fades a leaver held in its office door after 15 s, where it stands', () => {
    const { world, door, crew } = seatedWorld([member('mate', 'teammate')])
    world.setBodyObstacles([{ id: 'player', x: door.x, z: door.z, elevation: 0, radius: 0.55 }])
    crew([])
    const { largestStep, goneAtMs, firstFadeAtMs } = follow(world, `${LEAD}#mate`, 300)
    expect({ largestStep: largestStep <= MAX_STEP_METRES }).toEqual({ largestStep: true })
    // A few seconds' walk to the door, 15 s held there, then half a second of fade.
    expect(firstFadeAtMs).toBeGreaterThanOrEqual(15_000)
    expect((goneAtMs ?? Infinity) - (firstFadeAtMs ?? 0)).toBeLessThanOrEqual(600)
    expect(goneAtMs).toBeLessThanOrEqual(20_000)
  })

  it('never fades or moves an arriver by fiat; it sits once the door clears', () => {
    const { world, door, crew } = seatedWorld([])
    world.setBodyObstacles([{ id: 'player', x: door.x, z: door.z, elevation: 0, radius: 0.55 }])
    crew([member('mate', 'teammate')])
    const held = follow(world, `${LEAD}#mate`, 400)
    expect({ goneAtMs: held.goneAtMs, firstFadeAtMs: held.firstFadeAtMs }).toEqual({
      goneAtMs: null,
      firstFadeAtMs: null
    })
    expect(held.largestStep).toBeLessThanOrEqual(MAX_STEP_METRES)
    world.setBodyObstacles([])
    follow(world, `${LEAD}#mate`, 300)
    const seated = world.step(0).find((view) => view.agentKey === `${LEAD}#mate`)!
    const seat = world
      .layout()
      .floors.flatMap((floor) => floor.rooms)
      .find((room) => room.id === seated.roomId)
      ?.slots.find((slot) => slot.id === seated.slotId)
    expect(
      Math.hypot(seated.x - (seat?.x ?? Infinity), seated.z - (seat?.z ?? Infinity))
    ).toBeLessThan(0.02)
  })
})
