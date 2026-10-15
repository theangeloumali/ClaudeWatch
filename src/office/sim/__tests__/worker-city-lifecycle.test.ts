import { expect, it } from 'vitest'
import { World } from '../world'
import { buildLayout } from '../layout'
import { session, subagent } from '../fixtures'
import { resolveEffectiveWorld } from '../effective-world'
import { createWorldDocument } from '../../../shared/office/world-document'
import type { WorldVenue } from '../world-venues'

it('lets an eligible idle worker leave its actual office door, reach the arcade, and return to work', () => {
  const actor = {
    ...session('worker'),
    observation: {
      sourceId: 'source',
      coverage: 'own' as const,
      observedAtMs: 0,
      staleAfterMs: 300_000
    }
  }
  const document = createWorldDocument(buildLayout([actor], undefined), [actor])
  const arcade = document.venues.find((venue) => venue.kind === 'arcade')
  if (!arcade) throw new Error('Fixture has no arcade')
  const venue: WorldVenue = {
    id: arcade.id,
    kind: arcade.kind,
    capacity: arcade.capacity,
    entrance: {
      x: arcade.footprint.x + arcade.entrance.x,
      z: arcade.footprint.z + arcade.entrance.z
    },
    slots: arcade.slots.map((slot) => ({
      ...slot,
      x: arcade.footprint.x + slot.x,
      z: arcade.footprint.z + slot.z
    }))
  }
  const world = new World({
    now: () => 0,
    resolveLayout: (base, current) => resolveEffectiveWorld(base, document, current),
    getVenueTargets: () => [venue]
  })
  world.apply({
    type: 'hello',
    v: 1,
    snapshot: {
      rev: 1,
      generatedAtMs: 0,
      sessions: [actor],
      sources: [{ id: 'source', ok: true, detail: '' }]
    }
  })
  const home = world.step(0)[0]
  let hasReachedStreet = false
  let hasReachedArcade = false
  for (let tick = 0; tick < 1500; tick++) {
    const current = world.step(100)[0]
    hasReachedStreet ||= current.physicalFloorId === null
    hasReachedArcade ||=
      current.physicalFloorId === null &&
      venue.slots.some((slot) => Math.hypot(current.x - slot.x, current.z - slot.z) < 0.02)
    if (hasReachedArcade) break
  }
  const visitor = world.step(0)[0]
  expect(hasReachedStreet).toBe(true)
  expect(hasReachedArcade).toBe(true)
  expect(visitor.physicalFloorId).toBeNull()
  expect(
    venue.slots.some((slot) => Math.hypot(visitor.x - slot.x, visitor.z - slot.z) < 0.02)
  ).toBe(true)
  world.apply({
    type: 'patch',
    v: 1,
    seq: 2,
    removed: [],
    upserts: [{ ...actor, activity: 'thinking' }]
  })
  for (let tick = 0; tick < 1500; tick++) world.step(100)
  expect(world.step(0)[0]).toMatchObject({
    physicalFloorId: home.floorId,
    activity: 'thinking',
    x: home.x,
    z: home.z
  })
  expect(world.step(0)[0].venueId).toBeUndefined()
})

it.each([8, 20, 40])(
  'gives %i late teammates/subagents distinct desks and gets every working body to its seat',
  (count) => {
    const lead = { ...session('lead'), activity: 'thinking' as const }
    const document = createWorldDocument(buildLayout([lead], undefined), [lead])
    const world = new World({
      loungeTrips: false,
      resolveLayout: (base, current) => resolveEffectiveWorld(base, document, current)
    })
    world.apply({
      type: 'hello',
      v: 1,
      snapshot: { rev: 1, generatedAtMs: 0, sessions: [lead], sources: [] }
    })
    const members = Array.from({ length: count }, (_, index) => ({
      ...subagent(`member:${index}`, index % 2 ? 'teammate' : 'subagent'),
      name: `Worker ${index}`,
      activity: 'thinking' as const
    }))
    world.apply({
      type: 'patch',
      v: 1,
      seq: 2,
      removed: [],
      upserts: [{ ...lead, subagents: members }]
    })
    for (let tick = 0; tick < 1500; tick++) world.step(100)
    const agents = world.step(0)
    expect(agents).toHaveLength(count + 1)
    expect(
      new Set(agents.map((agent) => `${agent.floorId}:${agent.roomId}:${agent.slotId}`)).size
    ).toBe(count + 1)
    const layout = world.layout()
    for (const agent of agents) {
      const floor = layout.floors.find((candidate) => candidate.id === agent.floorId)
      const room = floor?.rooms.find((room) => room.id === agent.roomId)
      const seat = room?.slots.find((slot) => slot.id === agent.slotId)
      expect(seat).toBeDefined()
      expect(
        Math.hypot(agent.x - (seat?.x ?? Infinity), agent.z - (seat?.z ?? Infinity)),
        JSON.stringify({
          key: agent.agentKey,
          body: { x: agent.x, z: agent.z, floor: agent.physicalFloorId },
          seat,
          door: room?.door
        })
      ).toBeLessThan(0.02)
      expect(agent.physicalFloorId).toBe(agent.floorId)
      expect(agent.place).toBeUndefined()
    }
  }
)
