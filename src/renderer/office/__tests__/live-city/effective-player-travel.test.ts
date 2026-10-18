import { expect, it } from 'vitest'
import { session } from '../../../../office/sim/fixtures'
import { buildLayout } from '../../../../office/sim/layout'
import { resolveEffectiveWorld } from '../../../../office/sim/effective-world'
import { createWorldDocument } from '../../../../shared/office/world-document'
import { toFloorGeometry } from '../../../office-live/layout-geometry'
import { createPlayer } from '../../player/walking'
import { playerConnector, travelPlayerToFloor } from '../../player/player-floor-routes'
import { tickPlayer } from '../../player/walking'
import { walkGround } from '../../player/walk-ground'

it('travels through real building entrances and connectors instead of treating the destination as a solid lot', () => {
  const sessions = [session('one')]
  const base = buildLayout(sessions, undefined)
  const document = createWorldDocument(base, sessions)
  document.buildings[0].floors = 3
  const floors = toFloorGeometry(resolveEffectiveWorld(base, document, sessions), sessions)
  const player = createPlayer(playerConnector(floors[0]))
  player.physicalFloorId = floors[0].floorId
  expect(travelPlayerToFloor(player, floors[2], floors)).toBe(true)
  expect(player.path.some((point) => point.elevation === 11)).toBe(true)
  for (let step = 0; step < 1000; step++) {
    const floor = floors.find((floor) => floor.floorId === player.physicalFloorId) ?? floors[0]
    tickPlayer(player, walkGround(floor, [], floor), 0.05, 0, [])
  }
  expect(player.elevation).toBe(11)
  expect(player.path).toHaveLength(0)
  expect(walkGround(floors[2], [], floors[2]).isOpen(player.position)).toBe(true)
})
