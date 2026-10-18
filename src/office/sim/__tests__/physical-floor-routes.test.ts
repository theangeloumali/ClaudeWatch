import { expect, it } from 'vitest'
import { World } from '../world'
import { buildLayout, type LayoutMap } from '../layout'
import { session } from '../fixtures'
import type { SessionRef } from '../../../shared/office/types'
import { bodyFits, bodyStep } from '../../../shared/office/body-footprints'

function storeys(base: LayoutMap, sessions: readonly SessionRef[]): LayoutMap {
  return {
    ...base,
    floors: [0, 1, 2].map((index) => ({
      ...buildLayout(
        sessions.filter((_, position) => position % 3 === index),
        undefined
      ).floors[0],
      id: `building:one:${index + 1}`,
      buildingId: 'building:one',
      elevation: index * 5.5
    }))
  }
}

it.each([20, 40, 60])('keeps %i identities on their actual storeys across updates', (count) => {
  const sessions = Array.from({ length: count }, (_, index) => session(`worker:${index}`))
  const world = new World({ resolveLayout: storeys, loungeTrips: false })
  world.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 1, generatedAtMs: 0, sessions, sources: [] }
  })
  const before = world.step(0)
  for (const [index, record] of sessions.entries()) {
    expect(before.find((agent) => agent.agentKey === record.key)).toMatchObject({
      floorId: `building:one:${(index % 3) + 1}`,
      physicalFloorId: `building:one:${(index % 3) + 1}`,
      elevation: (index % 3) * 5.5
    })
  }
  world.apply({
    type: 'patch',
    v: 1,
    seq: 2,
    removed: [],
    upserts: sessions.map((record) => ({ ...record, activity: 'editing' as const }))
  })
  for (let tick = 0; tick < 30; tick++) world.step(100)
  const after = world.step(0)
  expect(after).toHaveLength(count)
  expect(new Set(after.map((agent) => agent.agentKey)).size).toBe(count)
  for (const agent of after) {
    const previous = before.find((candidate) => candidate.agentKey === agent.agentKey)!
    expect(agent).toMatchObject({
      floorId: previous.floorId,
      physicalFloorId: previous.physicalFloorId,
      elevation: previous.elevation,
      x: previous.x,
      z: previous.z
    })
  }
  expect(world.baseLayout().floors.map((floor) => floor.id)).toEqual(['hq'])
})

it('walks an edited floor through its connector without resetting feed revision', () => {
  let elevation = 0
  const resolveLayout = (base: LayoutMap): LayoutMap => ({
    ...base,
    floors: base.floors.map((floor) => ({ ...floor, id: `floor:${elevation}`, elevation }))
  })
  const world = new World({ resolveLayout, loungeTrips: false })
  world.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 7, generatedAtMs: 0, sessions: [session('worker')], sources: [] }
  })
  const start = world.step(0)[0]
  elevation = 5.5
  world.refreshLayout()
  expect(world.step(0)[0]).toMatchObject({
    x: start.x,
    z: start.z,
    elevation: 0,
    floorId: 'floor:5.5'
  })
  let previous = world.step(0)[0]
  let hasUsedConnector = false
  let hasRefreshedInConnector = false
  for (let tick = 0; tick < 1000; tick++) {
    const current = world.step(100)[0]
    expect(
      Math.hypot(
        current.x - previous.x,
        current.z - previous.z,
        (current.elevation ?? 0) - (previous.elevation ?? 0)
      )
    ).toBeLessThanOrEqual(0.140001)
    hasUsedConnector ||= current.physicalFloorId === null && (current.elevation ?? 0) > 0
    if (
      current.physicalFloorId === null &&
      (current.elevation ?? 0) > 0 &&
      !hasRefreshedInConnector
    ) {
      world.refreshLayout()
      expect(world.step(0)[0]).toMatchObject({
        x: current.x,
        z: current.z,
        elevation: current.elevation,
        physicalFloorId: null
      })
      hasRefreshedInConnector = true
    }
    previous = current
  }
  expect(hasUsedConnector).toBe(true)
  expect(hasRefreshedInConnector).toBe(true)
  expect(previous).toMatchObject({ elevation: 5.5, physicalFloorId: 'floor:5.5' })
  expect(world.revision()).toBe(7)
})

it('ignores upper-storey bodies while sweeping ground and rejects nonfinite elevation', () => {
  const body = { id: 'ground', x: 0, z: 0, radius: 0.65 }
  expect(
    bodyStep({
      body,
      to: { x: 0.1, z: 0 },
      obstacles: [{ ...body, id: 'upper', elevation: 5.5 }],
      isOpen: () => true
    })
  ).toEqual({ x: 0.1, z: 0 })
  expect(bodyFits({ ...body, elevation: Number.NaN }, [])).toBe(false)
})

it('never sends an unobserved member to an advanced venue on its lead coverage', () => {
  const lead = {
    ...session('lead'),
    attention: 'done' as const,
    observation: {
      sourceId: 'source',
      coverage: 'own' as const,
      observedAtMs: 0,
      staleAfterMs: 100_000
    },
    subagents: [{ id: 'member', type: 'worker', activity: 'idle' as const }]
  }
  const world = new World({
    getVenueTargets: () => [
      {
        id: 'arcade',
        kind: 'arcade',
        entrance: { x: 0, z: 0 },
        slots: [{ id: 'seat', x: 0, z: -10, heading: 0 }],
        capacity: 1
      }
    ]
  })
  world.apply({
    type: 'hello',
    v: 1,
    snapshot: {
      rev: 1,
      generatedAtMs: 0,
      sessions: [lead],
      sources: [{ id: 'source', ok: true, detail: '' }]
    }
  })
  for (let tick = 0; tick < 250; tick++) world.step(100)
  expect(world.step(0).find((agent) => agent.agentKey === 'lead#member')?.place).toBeUndefined()
})
