import { expect, it } from 'vitest'
import { makeFloor, makeRoom } from '../fixtures'
import { groupZonesByTheme } from '../../logic/office-themes'

it('uses an edited room theme without changing its sibling room or source assignment', () => {
  const floor = makeFloor({
    floorId: 'floor:example',
    rooms: [
      { ...makeRoom({ id: 'personal', sessionKey: 'claude:one' }), themeId: 'samurai-empire' },
      makeRoom({ id: 'sibling', sessionKey: 'claude:two' })
    ]
  })
  const groups = groupZonesByTheme(floor, () => 'neo-edo-steam')
  expect(
    groups.find((group) => group.themeId === 'samurai-empire')?.rooms.map((room) => room.id)
  ).toEqual(['personal'])
  expect(
    groups.find((group) => group.themeId === 'neo-edo-steam')?.rooms.map((room) => room.id)
  ).toEqual(['sibling'])
})
