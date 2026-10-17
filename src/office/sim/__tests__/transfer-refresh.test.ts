import { expect, it, vi } from 'vitest'
import { session } from '../fixtures'
import { World } from '../world'
import { buildLayout } from '../layout'
import { resolveEffectiveWorld } from '../effective-world'
import { createWorldDocument } from '../../../shared/office/world-document'
import { DEPARTURE_FADE_MS } from '../../../shared/office/types'

// Full sim or scene builds: the 5 s default times out under multi-agent load (health-9).
vi.setConfig({ testTimeout: 60_000 })

// Equivalent observations every tick must not restart the fade, or it never lands.
it('fades a desk moved two storeys up across, through observations every tick', () => {
  const sessions = [session('one')]
  const base = buildLayout(sessions, undefined)
  const document = createWorldDocument(base, sessions)
  document.buildings[0].floors = 3
  const world = new World({
    loungeTrips: false,
    resolveLayout: (layout, current) => resolveEffectiveWorld(layout, document, current)
  })
  world.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 0, generatedAtMs: 1000, sessions, sources: [] }
  })
  const before = world.step(0)[0]
  document.rooms[0].floorNumber = 3
  document.revision++
  world.refreshLayout()
  const elevations = new Set<number>()
  let landedAtMs: number | null = null
  for (let tick = 1; tick <= 20; tick++) {
    world.apply({ type: 'patch', v: 1, seq: tick, removed: [], upserts: sessions })
    const agent = world.step(100)[0]
    elevations.add(agent.elevation ?? 0)
    if (agent.elevation === 11 && agent.fade === undefined) landedAtMs ??= tick * 100
    if (agent.elevation === 0)
      expect({ x: agent.x, z: agent.z }).toEqual({ x: before.x, z: before.z })
  }
  expect([...elevations]).toEqual([0, 11])
  expect(landedAtMs).toBeLessThanOrEqual(DEPARTURE_FADE_MS + 100)
})
