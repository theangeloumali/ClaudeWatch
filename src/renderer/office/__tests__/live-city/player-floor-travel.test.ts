import { expect, it } from 'vitest'
import { createPlayer, tickPlayer } from '../../player/walking'
import { travelPlayerToFloor } from '../../player/player-floor-routes'
import type { FloorGeometry } from '../../scene-model'

const floor = (number: number): FloorGeometry => ({
  floorId: `tower:${number}`,
  buildingId: 'tower',
  floorNumber: number,
  elevation: (number - 1) * 5.5,
  label: `Floor ${number}`,
  plate: 0,
  x: 0,
  z: 0,
  width: 12,
  depth: 12,
  elevator: { x: 0, z: 0 },
  connector: { x: 0, z: 2 },
  corridor: { z: 0, width: 3 },
  rooms: [],
  zones: []
})

it('visits storeys by bounded connector travel rather than elevation selection', () => {
  const floors = [floor(1), floor(2), floor(3)]
  const player = createPlayer({ x: 3, z: 3 })
  player.physicalFloorId = floors[0].floorId
  player.elevation = 0
  expect(travelPlayerToFloor(player, floors[2], floors)).toBe(true)
  expect(player.elevation).toBe(0)
  let hasRidden = false
  for (let frame = 0; frame < 300; frame++) {
    const before = { ...player.position, elevation: player.elevation ?? 0 }
    tickPlayer(player, { isOpen: () => true }, 0.1, 0)
    expect(
      Math.hypot(
        player.position.x - before.x,
        player.position.z - before.z,
        (player.elevation ?? 0) - before.elevation
      )
    ).toBeLessThanOrEqual(0.400001)
    hasRidden ||= player.physicalFloorId === null && (player.elevation ?? 0) > 0
  }
  expect(hasRidden).toBe(true)
  expect(player).toMatchObject({ elevation: 11, physicalFloorId: floors[2].floorId })
})

it('does not let upper-floor bodies block the ground player', () => {
  const player = createPlayer({ x: 0, z: 0 })
  player.elevation = 0
  player.held.add('d')
  expect(
    tickPlayer(player, { isOpen: () => true }, 0.1, 0, [
      { id: 'upper', x: 0.4, z: 0, radius: 0.65, elevation: 5.5 }
    ])
  ).toBe(true)
  expect(player.position.x).toBeCloseTo(0.4)
})
