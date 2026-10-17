import { expect, it } from 'vitest'
import { World } from '../world'
import { buildLayout, type LayoutMap } from '../layout'
import { session, subagent } from '../fixtures'
import type { AgentView, SessionRef } from '../../../shared/office/types'

const sessions = [
  session('claude:lower', 'lower-project'),
  session('claude:upper', 'upper-project')
]

function resolveLayout(base: LayoutMap, current: readonly SessionRef[]): LayoutMap {
  return {
    ...base,
    floors: current.map((record, index) => ({
      ...buildLayout([record], undefined).floors[0],
      id: `building:one:${index + 1}`,
      buildingId: 'building:one',
      floorNumber: index + 1,
      elevation: index * 5.5
    }))
  }
}

it('uses the effective floor model for home assignment and physical elevation', () => {
  const world = new World({ ...{ resolveLayout }, loungeTrips: false })
  world.apply({
    type: 'hello',
    v: 1,
    snapshot: {
      rev: 1,
      generatedAtMs: 1000,
      sessions,
      sources: []
    }
  })
  expect(world.layout().floors.map((floor) => floor.id)).toEqual([
    'building:one:1',
    'building:one:2'
  ])
  const agents = world.step(100)
  expect(agents).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        agentKey: sessions[0].key,
        floorId: 'building:one:1',
        physicalFloorId: 'building:one:1',
        elevation: 0
      }),
      expect.objectContaining({
        agentKey: sessions[1].key,
        floorId: 'building:one:2',
        physicalFloorId: 'building:one:2',
        elevation: 5.5
      })
    ])
  )
  expect(agents).toHaveLength(2)
})

it('does not remove or duplicate a worker when activity updates on different storeys', () => {
  const world = new World({ ...{ resolveLayout }, loungeTrips: false })
  world.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 1, generatedAtMs: 1000, sessions, sources: [] }
  })
  world.apply({
    type: 'patch',
    v: 1,
    seq: 2,
    removed: [],
    upserts: [{ ...sessions[1], activity: 'editing' }]
  })
  for (let tick = 0; tick < 50; tick++) world.step(100)
  const agents = world.step(0)
  expect(agents.map((agent) => agent.agentKey)).toEqual(sessions.map((record) => record.key))
  expect(agents[1]).toMatchObject({
    physicalFloorId: 'building:one:2',
    elevation: 5.5,
    activity: 'editing'
  })
})

it('an agent that fades or leaves while riding the lift frees it for the next walker', () => {
  const lead: SessionRef = { ...sessions[1], activity: 'running', subagents: [] }
  const world = new World({ resolveLayout, loungeTrips: false })
  world.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 1, generatedAtMs: 1000, sessions: [sessions[0], lead], sources: [] }
  })
  let sequence = 1
  const crew = (ids: string[]) =>
    world.apply({
      type: 'patch',
      v: 1,
      seq: ++sequence,
      removed: [],
      upserts: [{ ...lead, subagents: ids.map((id) => ({ ...subagent(id), activity: 'running' })) }]
    })
  const step = (id: string) =>
    world.step(100).find((agent) => agent.agentKey === `${lead.key}#${id}`)
  const isSeated = (view: AgentView | undefined) => {
    const seat = world
      .layout()
      .floors.find((floor) => floor.id === view?.floorId)
      ?.rooms.find((room) => room.id === view?.roomId)
      ?.slots.find((slot) => slot.id === view?.slotId)
    return (
      view?.physicalFloorId === view?.floorId &&
      !!seat &&
      Math.hypot(view!.x - seat.x, view!.z - seat.z) < 0.02
    )
  }
  crew(['rider'])
  let rider = step('rider')
  for (let tick = 0; tick < 600 && !rider?.connectorId; tick++) rider = step('rider')
  expect(rider).toMatchObject({ physicalFloorId: null, connectorId: 'building:one' })
  // Its work ends mid-ride, so it fades where it stands.
  crew([])
  crew(['next'])
  let next = step('next')
  for (let tick = 0; tick < 600 && !isSeated(next); tick++) next = step('next')
  expect(next).toMatchObject({ physicalFloorId: 'building:one:2', elevation: 5.5 })
  expect(isSeated(next)).toBe(true)
})
