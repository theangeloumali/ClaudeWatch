import { expect, it, vi } from 'vitest'
import { World } from '../world'
import { buildLayout } from '../layout'
import { session, subagent } from '../fixtures'
import { resolveEffectiveWorld } from '../effective-world'
import { createWorldDocument } from '../../../shared/office/world-document'

// Full sim or scene builds: the 5 s default times out under multi-agent load (health-9).
vi.setConfig({ testTimeout: 60_000 })

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
