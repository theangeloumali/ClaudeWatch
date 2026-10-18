import { describe, expect, it } from 'vitest'
import { WORKER_BODY_RADIUS } from '../../../shared/office/body-footprints'
import { DEPARTURE_FADE_MS, type SessionRef } from '../../../shared/office/types'
import { createWorldDocument } from '../../../shared/office/world-document'
import { createAgent } from '../behaviour'
import { resolveEffectiveWorld } from '../effective-world'
import { session } from '../fixtures'
import { buildLayout, deskOf } from '../layout'
import { World } from '../world'
import { seatAtDesk } from '../world-recall'
import { TICK_MS } from './door-invariants'

describe('recall: reappearing at its desk', () => {
  const layout = buildLayout([{ ...session('claude:a'), activity: 'thinking' }], undefined)
  const floor = layout.floors[0]
  const room = floor.rooms.find((candidate) => candidate.sessionKey === 'claude:a')!
  const desk = room.slots.find((slot) => slot.id !== 'door')!
  const atDesk = createAgent(
    { ...session('claude:a'), activity: 'thinking' },
    { floorId: floor.id, roomId: room.id, slotId: desk.id, x: desk.x, z: desk.z, heading: 0 },
    false
  )
  const away = { ...atDesk, view: { ...atDesk.view, x: 300, z: 300 } }
  const body = (x: number) => ({
    id: 'other',
    x,
    z: desk.z,
    elevation: 0,
    radius: WORKER_BODY_RADIUS
  })

  it('waits while another body stands on its desk', () => {
    expect(seatAtDesk(away, layout.floors, [body(desk.x)])).toBeNull()
  })

  // Called home from the lounge while faded, it must not show gaming at its desk (Minor 5).
  it('is no longer away once seated at its desk', () => {
    const lounging = { ...away, view: { ...away.view, place: 'lounge' as const } }
    expect(seatAtDesk(lounging, layout.floors, [])?.view).not.toHaveProperty('place')
  })

  it('sits down working at its desk once the desk is clear', () => {
    const seated = seatAtDesk(away, layout.floors, [body(desk.x + 2)])
    expect(seated && { x: seated.view.x, z: seated.view.z, state: seated.state }).toEqual({
      x: desk.x,
      z: desk.z,
      state: 'working'
    })
  })
})

// Each fades toward the desk the other still stands on; neither may wait on the other (C1).
it('seats two agents whose offices swap floors at the same spot once their fades end', () => {
  const sessions: SessionRef[] = ['claude:a', 'claude:b'].map((key) => ({
    ...session(key, 'p_a'),
    activity: 'thinking'
  }))
  const base = buildLayout(sessions, undefined)
  const document = createWorldDocument(base, sessions)
  document.buildings[0].floors = 2
  const [first, second] = sessions.map(
    (record) => document.rooms.find((room) => room.target === `session:${record.key}`)!
  )
  second.floorNumber = 2
  second.position = { ...first.position }
  const world = new World({
    resolveLayout: (layout, current) => resolveEffectiveWorld(layout, document, current),
    loungeTrips: false,
    now: () => 0
  })
  world.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 1, generatedAtMs: 0, sessions, sources: [] }
  })
  ;[first.floorNumber, second.floorNumber] = [2, 1]
  world.refreshLayout()
  let views = world.step(0)
  for (let elapsed = 0; elapsed < DEPARTURE_FADE_MS + 2 * TICK_MS; elapsed += TICK_MS)
    views = world.step(TICK_MS)
  const floors = world.layout().floors
  expect(
    views.map((view) => {
      const desk = deskOf(floors, view)!.desk
      return [
        view.fade,
        view.physicalFloorId === view.floorId,
        view.x === desk.x,
        view.z === desk.z
      ]
    })
  ).toEqual([
    [undefined, true, true, true],
    [undefined, true, true, true]
  ])
})
