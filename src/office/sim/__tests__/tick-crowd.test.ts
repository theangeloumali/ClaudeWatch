import { describe, expect, it } from 'vitest'
import { agentBody } from '../agent-body'
import { createAgent, type AgentRecord } from '../behaviour'
import { session } from '../fixtures'
import { TickCrowd } from '../tick-crowd'

const desk = { floorId: 'hq', roomId: 'room', slotId: 'desk_main', x: 0, z: 0, heading: 0 }
const at = (key: string, x: number, path: AgentRecord['path'] = []): AgentRecord => {
  const agent = createAgent(session(key), { ...desk, x }, false)
  return { ...agent, path }
}
const player = { id: 'player', x: 9, z: 9, elevation: 0, radius: 0.55 }
const ids = (crowd: TickCrowd) => ({
  bodies: crowd.bodies.map((body) => body.id),
  walkers: crowd.walkers.map((walker) => walker.body.id)
})

describe('tick crowd: one tick of bodies and walkers, kept current', () => {
  const seated = at('a', 0)
  const walking = at('b', 2, [{ x: 4, z: 0 }])
  const arriving = at('c', 6, [{ x: 6, z: 0 }])

  it('lists every agent in order, then the obstacles; walkers have a waypoint still ahead', () => {
    const crowd = new TickCrowd([seated, walking, arriving], [player])
    expect(ids(crowd)).toEqual({ bodies: ['a', 'b', 'c', 'player'], walkers: ['b'] })
    expect(crowd.walkers[0]).toEqual({ body: agentBody(walking.view), to: { x: 4, z: 0 } })
  })

  it('moves an agent in place, adding and dropping it as a walker in agent order', () => {
    const crowd = new TickCrowd([seated, walking, arriving], [player])
    crowd.updated(at('c', 5, [{ x: 7, z: 0 }]))
    crowd.updated(at('a', 1, [{ x: 3, z: 0 }]))
    expect(ids(crowd)).toEqual({ bodies: ['a', 'b', 'c', 'player'], walkers: ['a', 'b', 'c'] })
    expect(crowd.bodies[0].x).toBe(1)
    crowd.updated(at('b', 4, [{ x: 4, z: 0 }]))
    expect(ids(crowd).walkers).toEqual(['a', 'c'])
  })

  it('admits a newcomer it was built without, after the obstacles', () => {
    const crowd = new TickCrowd([seated, walking], [player])
    crowd.updated(arriving)
    expect(ids(crowd)).toEqual({ bodies: ['a', 'b', 'player', 'c'], walkers: ['b'] })
    crowd.remove('b')
    crowd.updated(at('c', 5))
    expect(crowd.bodies.map((body) => [body.id, body.x])).toEqual([
      ['a', 0],
      ['player', 9],
      ['c', 5]
    ])
  })

  it('forgets a removed agent and keeps the order of the rest', () => {
    const crowd = new TickCrowd([seated, walking, arriving], [player])
    crowd.remove('b')
    crowd.updated(at('c', 5))
    expect(ids(crowd)).toEqual({ bodies: ['a', 'c', 'player'], walkers: [] })
    expect(crowd.bodies[1].x).toBe(5)
  })
})
