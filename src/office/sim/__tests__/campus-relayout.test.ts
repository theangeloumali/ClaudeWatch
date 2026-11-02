import { expect, it, vi } from 'vitest'
import { session } from '../fixtures'
import { World } from '../world'
import { resolveEffectiveWorld, type EffectiveWorldLayout } from '../effective-world'
import { buildLayout } from '../layout'
import { createWorldDocument } from '../../../shared/office/world-document'
import { DEPARTURE_FADE_MS } from '../../../shared/office/types'

vi.setConfig({ testTimeout: 60_000 })

const sessions = [session('one', 'project:a'), session('two', 'project:b')]
const document = createWorldDocument(buildLayout(sessions, undefined), sessions)

function worldIn(layout: { current: EffectiveWorldLayout }): World {
  const world = new World({
    loungeTrips: false,
    resolveLayout: (base, current) => resolveEffectiveWorld(base, document, current, layout.current)
  })
  world.apply({
    type: 'hello',
    v: 1,
    snapshot: { rev: 0, generatedAtMs: 1000, sessions, sources: [] }
  })
  return world
}

it('drops venues and town lots in Campus while City keeps them', () => {
  const base = buildLayout(sessions, undefined)
  const city = resolveEffectiveWorld(base, document, sessions, 'city')
  const campus = resolveEffectiveWorld(base, document, sessions, 'campus')
  expect(city.effectiveVenues?.length).toBeGreaterThan(0)
  expect(campus.effectiveVenues).toEqual([])
  expect(campus.streetBlocks).toEqual([])
  expect(resolveEffectiveWorld(base, document, sessions)).toEqual(city)
})

it('re-seats agents at their Campus desks through the fade, never walking the streets', () => {
  const layout = { current: 'city' as EffectiveWorldLayout }
  const switched = worldIn(layout)
  const before = switched.step(0)
  layout.current = 'campus'
  switched.refreshLayout()
  const seated = worldIn({ current: 'campus' }).step(0)
  let last = switched.step(0)
  for (let tick = 0; tick * 100 <= DEPARTURE_FADE_MS + 500; tick++) {
    last = switched.step(100)
    // A walker would pass between its two desks; a re-seat jumps straight from one to the other.
    for (const agent of last) {
      const seats = [before, seated].map((agents) => {
        const seat = agents.find((candidate) => candidate.agentKey === agent.agentKey)
        return { x: seat?.x, z: seat?.z }
      })
      expect(seats).toContainEqual({ x: agent.x, z: agent.z })
    }
  }
  for (const agent of last) {
    const target = seated.find((candidate) => candidate.agentKey === agent.agentKey)
    expect({ x: agent.x, z: agent.z, fade: agent.fade }).toEqual({
      x: target?.x,
      z: target?.z,
      fade: undefined
    })
  }
})
