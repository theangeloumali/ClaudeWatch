import { expect, it } from 'vitest'
import { createAgent, setFinished, tickAgent, LOUNGE_DELAY_MS } from '../behaviour'
import { session } from '../fixtures'
import { VenueBookings, type WorldVenue } from '../world-venues'
import { World } from '../world'
import { streetPath } from '../street-path'
import { bodyFits } from '../../../shared/office/body-footprints'

const venue: WorldVenue = {
  id: 'arcade',
  kind: 'arcade',
  entrance: { x: 0, z: -4 },
  slots: [{ id: 'seat', x: 0, z: -6, heading: 0 }],
  capacity: 1
}

it('books only one visitor and queues the other without losing identity', () => {
  const agents = ['first', 'second'].map((key) =>
    tickAgent(
      setFinished(
        createAgent(
          session(key),
          { floorId: 'hq', roomId: key, slotId: 'desk_main', x: 0, z: 0, heading: 0 },
          []
        ),
        true
      ),
      LOUNGE_DELAY_MS
    )
  )
  const bookings = new VenueBookings()
  const assignments = bookings.reconcile({ agents, venues: [venue], canVisit: () => true })
  expect([...assignments.keys()]).toEqual(['first'])
  bookings.release('first')
  expect([
    ...bookings.reconcile({ agents: agents.slice(1), venues: [venue], canVisit: () => true }).keys()
  ]).toEqual(['second'])
})

it('freezes new leisure choices on resync and failed own source', () => {
  const actor = {
    ...session('actor'),
    attention: 'done' as const,
    observation: {
      sourceId: 'source',
      coverage: 'own' as const,
      observedAtMs: 0,
      staleAfterMs: 100_000
    }
  }
  const world = new World({ getVenueTargets: () => [venue] })
  world.apply({
    type: 'hello',
    v: 1,
    snapshot: {
      rev: 1,
      generatedAtMs: 0,
      sessions: [actor],
      sources: [{ id: 'source', ok: false, detail: 'offline' }]
    }
  })
  for (let tick = 0; tick < 250; tick++) world.step(100)
  expect(world.step(0)[0].place).toBeUndefined()
  world.apply({ type: 'resync' })
  for (let tick = 0; tick < 250; tick++) world.step(100)
  expect(world.step(0)).toHaveLength(1)
  expect(world.step(0)[0]).toMatchObject({
    agentKey: actor.key,
    attention: 'done',
    activity: 'idle'
  })
  expect(world.step(0)[0].place).toBeUndefined()
})

it('keeps connector capacity one even when its occupants are vertically separated', () => {
  const body = { id: 'lower', x: 0, z: 0, radius: 0.65, elevation: 1, connectorId: 'lift' }
  expect(bodyFits(body, [{ ...body, id: 'upper', elevation: 9 }])).toBe(false)
  expect(bodyFits(body, [{ ...body, id: 'upper', elevation: 9, connectorId: 'other-lift' }])).toBe(
    true
  )
})

it('routes a street around a building without a city occupancy bitmap', () => {
  const route = streetPath({
    from: { x: -10, z: 0 },
    to: { x: 10, z: 0 },
    blocks: [{ x: 0, z: 0, width: 4, depth: 4 }]
  })
  expect(route[0]).toEqual({ x: -10, z: 0 })
  expect(route.at(-1)).toEqual({ x: 10, z: 0 })
  expect(route.some((point) => Math.abs(point.z) > 2.8)).toBe(true)
})
