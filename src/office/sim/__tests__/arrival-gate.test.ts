import { describe, expect, it, vi } from 'vitest'
import type { SessionRef } from '../../../shared/office/types'
import { createWorldDocument } from '../../../shared/office/world-document'
import { resolveEffectiveWorld } from '../effective-world'
import { session } from '../fixtures'
import type { LayoutMap } from '../layout'
import { World } from '../world'
import { floorEntrance } from '../world-floor-routes'
import { TICK_MS } from './door-invariants'

// Full sim runs: the 5 s default times out under load (health-9).
vi.setConfig({ testTimeout: 60_000 })

const resolveLayout = (base: LayoutMap, current: readonly SessionRef[]): LayoutMap =>
  resolveEffectiveWorld(base, createWorldDocument(base, current), current)

describe('arrival gate (seating-3)', () => {
  it('admits a second arrival within 10 s while the first is pinned at the door', () => {
    const peer = session('claude:peer', 'p_app')
    const world = new World({ resolveLayout, loungeTrips: false, now: () => 0 })
    world.apply({
      type: 'hello',
      v: 1,
      snapshot: { rev: 1, generatedAtMs: 0, sessions: [peer], sources: [] }
    })
    const lobby = world.layout().floors.find((floor) => floor.id === world.step(0)[0].floorId)!
    const entrance = floorEntrance(lobby)
    const inward = Math.sign(lobby.z - entrance.z) || 1
    // A crowd across the whole lobby, filling the doorway: the first arriver is left outside.
    const across = Math.ceil(lobby.width / 2) + 1
    world.setBodyObstacles(
      Array.from({ length: across }, (_, index) => ({
        id: `crowd-${index}`,
        x: lobby.x - lobby.width / 2 + index * 2,
        z: entrance.z + inward,
        elevation: 0,
        radius: 1.2
      }))
    )
    const pinned = session('claude:pinned', 'p_app')
    world.apply({ type: 'patch', v: 1, seq: 2, removed: [], upserts: [pinned] })
    for (let elapsed = 0; elapsed < 20_000; elapsed += TICK_MS) world.step(TICK_MS)
    const second = session('claude:second', 'p_app')
    world.apply({ type: 'patch', v: 1, seq: 3, removed: [], upserts: [second] })
    let admittedAtMs: number | null = null
    for (let elapsed = TICK_MS; elapsed <= 10_000 && admittedAtMs === null; elapsed += TICK_MS)
      if (world.step(TICK_MS).some((view) => view.agentKey === second.key)) admittedAtMs = elapsed
    const keys = world.step(0).map((view) => view.agentKey)
    // The pinned arriver is never removed or moved by fiat; it only stops holding the gate.
    expect({ isPinnedKept: keys.includes(pinned.key), admittedAtMs }).toEqual({
      isPinnedKept: true,
      admittedAtMs: expect.any(Number)
    })
  })
})
