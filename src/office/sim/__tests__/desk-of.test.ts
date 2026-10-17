import { describe, expect, it } from 'vitest'
import { session } from '../fixtures'
import { buildLayout, deskOf } from '../layout'

describe('deskOf: the desk an agent belongs at', () => {
  const layout = buildLayout([session('claude:a')], undefined)
  const floor = layout.floors[0]
  const room = floor.rooms.find((candidate) => candidate.sessionKey === 'claude:a')!
  const desk = room.slots.find((slot) => slot.id === 'desk_main')!
  const view = { floorId: floor.id, roomId: room.id, slotId: desk.id }

  it('finds the floor and the desk the view names', () => {
    expect(deskOf(layout.floors, view)).toEqual({ floor, desk })
  })

  it('finds none once the map no longer has that floor, room or desk', () => {
    expect([
      deskOf(layout.floors, { ...view, floorId: 'gone' }),
      deskOf(layout.floors, { ...view, roomId: 'gone' }),
      deskOf(layout.floors, { ...view, slotId: 'gone' })
    ]).toEqual([undefined, undefined, undefined])
  })
})
