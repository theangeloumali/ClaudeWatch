import { expect, it } from 'vitest'
import { buildOfficeLabels } from '../../logic/office-labels'
import { MOVER_FLOORS } from '../../town/movers.test-utils'

it('identifies each actual room at its own entrance instead of only labeling projects', () => {
  const floor = MOVER_FLOORS[0][1]
  const labels = buildOfficeLabels(floor)
  for (const room of floor.rooms) {
    const label = labels.find((candidate) => candidate.id === room.id)
    expect(label).toMatchObject({
      id: room.id,
      name: room.label,
      x: room.door.x,
      z: room.door.z,
      roomIds: [room.id]
    })
  }
})
