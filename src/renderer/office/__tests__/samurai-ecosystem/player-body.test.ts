import { expect, it } from 'vitest'
import { createPlayer, tickPlayer } from '../../player/walking'

const worker = { id: 'claude:worker', x: 1.5, z: 0, radius: 0.65 }
const open = { isOpen: () => true }

it('keyboard movement cannot cross a worker body', () => {
  const player = createPlayer({ x: 0, z: 0 })
  player.held.add('ArrowRight')
  for (let frame = 0; frame < 60; frame++) {
    tickPlayer(player, open, 1 / 60, 0, [worker])
    expect(
      Math.hypot(player.position.x - worker.x, player.position.z - worker.z)
    ).toBeGreaterThanOrEqual(1.2 - 1e-8)
  }
})

it('click walking passes around a stationary body and reaches its original goal', () => {
  const player = createPlayer({ x: 0, z: 0 })
  player.path = [{ x: 5, z: 0 }]
  for (let frame = 0; frame < 600 && player.path.length; frame++) {
    tickPlayer(player, open, 1 / 60, 0, [worker])
    expect(
      Math.hypot(player.position.x - worker.x, player.position.z - worker.z)
    ).toBeGreaterThanOrEqual(1.2 - 1e-8)
  }
  expect(player.position).toEqual({ x: 5, z: 0 })
})

it('click walking does not bypass static ground checks', () => {
  const player = createPlayer({ x: 0, z: 0 })
  player.path = [{ x: 4, z: 0 }]
  for (let frame = 0; frame < 60; frame++)
    tickPlayer(player, { isOpen: (point) => point.x < 2 }, 1 / 60, 0)
  expect(player.position.x).toBeLessThan(2)
})
