import { describe, expect, it } from 'vitest'
import { WORKER_BODY_RADIUS } from '../../../shared/office/body-footprints'
import { createAgent } from '../behaviour'
import { session } from '../fixtures'
import { buildLayout } from '../layout'
import { seatAtDesk } from '../world-recall'

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

  it('sits down working at its desk once the desk is clear', () => {
    const seated = seatAtDesk(away, layout.floors, [body(desk.x + 2)])
    expect(seated && { x: seated.view.x, z: seated.view.z, state: seated.state }).toEqual({
      x: desk.x,
      z: desk.z,
      state: 'working'
    })
  })
})
