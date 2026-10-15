import { expect, it } from 'vitest'
import { session } from '../fixtures'
import { World } from '../world'
import { buildLayout } from '../layout'
import { resolveEffectiveWorld } from '../effective-world'
import { createWorldDocument } from '../../../shared/office/world-document'

it('preserves an active lift route during equivalent source observations', () => {
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
  document.rooms[0].floorNumber = 3
  document.revision++
  world.refreshLayout()
  let previousY = 0
  let hasAscended = false
  for (let tick = 1; tick <= 1000; tick++) {
    world.apply({ type: 'patch', v: 1, seq: tick, removed: [], upserts: sessions })
    const agent = world.step(100)[0]
    if (agent.elevation! > previousY) hasAscended = true
    if (hasAscended) expect(agent.elevation).toBeGreaterThanOrEqual(previousY)
    previousY = agent.elevation ?? 0
  }
  expect(previousY).toBe(11)
})
