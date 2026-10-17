import { describe, expect, it, vi } from 'vitest'
import type { AgentView, SessionRef } from '../../../shared/office/types'
import { createWorldDocument } from '../../../shared/office/world-document'
import { resolveEffectiveWorld } from '../effective-world'
import { session, subagent } from '../fixtures'
import type { LayoutMap, RoomLayout } from '../layout'
import { World } from '../world'
import { CLEARED, runDoorChurn, runMixedSwap } from './door-churn-harness'
import { TICK_MS } from './door-invariants'

// Full sim churn: the 5 s default times out under load (health-9).
vi.setConfig({ testTimeout: 120_000 })

describe('door churn: a crew turning over through one lobby door', () => {
  it('lets departed subagents go and seats the current crew, every body honest', () => {
    const { loungersSetOut: _setOut, ...result } = runDoorChurn({})
    expect(result).toEqual({ ...CLEARED, loungersOutside: 0 })
  })

  // Every leaver fades in place, so a teammate crew clears the same way as subagents.
  it('does the same for teammates', () => {
    const { loungersSetOut: _setOut, ...result } = runDoorChurn({ kind: 'teammate' })
    expect(result).toEqual({ ...CLEARED, loungersOutside: 0 })
  })

  it('clears the churn while two idle peers take lounge trips indoors', () => {
    const { loungersSetOut, ...result } = runDoorChurn({ kind: 'teammate', hasLoungingPeers: true })
    // The lounge rule must send both off, or this is the plain churn (MISSED-3).
    expect(loungersSetOut).toBe(2)
    expect(result).toEqual({ ...CLEARED, loungersOutside: 0 })
  })

  // Review Focus 1, with a subagent crew as the owner's teams run them: leavers fade and
  // newcomers fade in, so only the peers' walk back from the lounge is left.
  it('clears a mixed swap with two loungers called back to work', () => {
    const { loungersSeated, doorClearAtMs, unseated } = runMixedSwap(60_000)
    expect(loungersSeated).toBe(true)
    expect({ isDoorClearWithin1s: (doorClearAtMs ?? Infinity) <= 1_000, unseated }).toEqual({
      isDoorClearWithin1s: true,
      unseated: 0
    })
  })
})

const LEAD = 'claude:lead'
// Offsets in the lead's office: `across` the door, `back` from it. The guests stand abreast
// 3.5 m behind the door, converging 18° apart: cos 0.95, so no alignment tweak passes this.
const SEATS: Record<string, [across: number, back: number]> = {
  desk_guest_0: [-0.56, 1.5],
  desk_guest_1: [0.56, 1.5],
  desk_main: [1.3, -0.5]
}
// Static bodies stand in for the lobby crowd: they funnel the pair so a detour cannot
// break the wait, yet leave room for one body at a time.
const CROWD: [across: number, back: number][] = [
  [-1.68, 1.5],
  [1.68, 1.5],
  [-1.3, 0],
  [1.3, 0]
]

function officeFrame(room: RoomLayout) {
  const door = room.slots.find((slot) => slot.id === 'door')!
  const length = Math.hypot(door.x - room.x, door.z - room.z)
  const toDoor = { x: (door.x - room.x) / length, z: (door.z - room.z) / length }
  return ([across, back]: [number, number]) => ({
    x: room.x - toDoor.z * across - toDoor.x * back,
    z: room.z + toDoor.x * across - toDoor.z * back
  })
}

function seatGuestsAbreast(base: LayoutMap, current: readonly SessionRef[]): LayoutMap {
  const map = resolveEffectiveWorld(base, createWorldDocument(base, current), current)
  const office = map.floors.flatMap((floor) => floor.rooms).find((r) => r.sessionKey === LEAD)
  if (!office) return map
  const at = officeFrame(office)
  for (const slot of office.slots) if (SEATS[slot.id]) Object.assign(slot, at(SEATS[slot.id]))
  return map
}

describe('door churn: a wait cycle at an office door', () => {
  // A simple 3-cycle cannot form under the yield rule, so the 3-body jam is a mutual pair
  // with an arriver held behind it (seating-1, MISSED-4).
  it('lets a locked pair through within 10 s and seats the arriver behind it', () => {
    const teammate = (id: string) => ({ ...subagent(id, 'teammate'), activity: 'running' as const })
    const lead: SessionRef = {
      ...session(LEAD, 'p_app'),
      activity: 'running',
      subagents: [teammate('m0'), teammate('m1')]
    }
    const world = new World({ resolveLayout: seatGuestsAbreast, loungeTrips: false, now: () => 0 })
    world.apply({
      type: 'hello',
      v: 1,
      snapshot: {
        rev: 1,
        generatedAtMs: 0,
        sessions: [lead, session('claude:peer', 'p_app')],
        sources: []
      }
    })
    const office = world
      .layout()
      .floors.flatMap((floor) => floor.rooms)
      .find((room) => room.sessionKey === LEAD)!
    const at = officeFrame(office)
    world.setBodyObstacles(
      CROWD.map((offset, index) => ({
        id: `crowd-${index}`,
        ...at(offset),
        elevation: 0,
        radius: 0.55
      }))
    )
    world.apply({
      type: 'patch',
      v: 1,
      seq: 2,
      removed: [],
      upserts: [{ ...lead, subagents: [teammate('n0')] }]
    })
    const isInOffice = (view: AgentView): boolean =>
      Math.abs(view.x - office.x) < office.width / 2 &&
      Math.abs(view.z - office.z) < office.depth / 2
    let views: AgentView[] = []
    for (let elapsed = TICK_MS; elapsed <= 10_000; elapsed += TICK_MS) views = world.step(TICK_MS)
    const leaversInOffice = views
      .filter((view) => view.agentKey !== `${LEAD}#n0` && view.agentKey.startsWith(`${LEAD}#`))
      .filter(isInOffice)
      .map((view) => view.agentKey)
    for (let elapsed = 0; elapsed < 40_000; elapsed += TICK_MS) views = world.step(TICK_MS)
    const arriver = views.find((view) => view.agentKey === `${LEAD}#n0`)
    const seat = office.slots.find((slot) => slot.id === arriver?.slotId)
    expect({
      leaversInOffice,
      arriverOffSeat: !arriver || !seat || Math.hypot(arriver.x - seat.x, arriver.z - seat.z) > 0.16
    }).toEqual({ leaversInOffice: [], arriverOffSeat: false })
  })
})
