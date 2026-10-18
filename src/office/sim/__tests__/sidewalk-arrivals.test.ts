import { expect, it, vi } from 'vitest'
import type { SessionRef } from '../../../shared/office/types'
import { CityWorld, observed, streetsOf } from './roaming-harness'

// Full sim runs: the 5 s default times out under load (health-9).
vi.setConfig({ testTimeout: 120_000 })

const working = (key: string, project: string, nowMs: number): SessionRef => ({
  ...observed(key, project, nowMs),
  activity: 'thinking'
})

// Its desk moves to the block across the avenue, where no zebra lines up with either door:
// the walk there is a ground arrival (P5b).
it('walks an agent to its new building along the sidewalks', () => {
  const city = new CityWorld(
    // An agent stays in each building, so none moves when the mover leaves; p_mid puts p_to
    // in the third lot, north of the avenue.
    (nowMs) => [
      working('claude:mover', 'p_from', nowMs),
      working('claude:stays', 'p_from', nowMs),
      working('claude:between', 'p_mid', nowMs),
      working('claude:anchor', 'p_to', nowMs)
    ],
    { hasVenues: false }
  )
  const streets = streetsOf(city.world.layout())
  const home = city.world.step(0).find((view) => view.agentKey === 'claude:mover')
  city.patch([working('claude:mover', 'p_to', city.clock)])
  const onAsphalt: string[] = []
  let hasCrossedStreet = false
  let isSeated = false
  city.run(150_000, (views, elapsedMs) => {
    const view = views.find((candidate) => candidate.agentKey === 'claude:mover')
    if (view?.physicalFloorId === null) {
      hasCrossedStreet = true
      if (streets.isOnAsphalt(view))
        onAsphalt.push(`${elapsedMs}: ${view.x.toFixed(2)},${view.z.toFixed(2)}`)
    }
    isSeated = city.isSeated(view)
    return isSeated && hasCrossedStreet
  })
  const moved = city.world.step(0).find((view) => view.agentKey === 'claude:mover')
  expect({
    hasMovedBuilding: moved?.floorId !== home?.floorId,
    hasCrossedStreet,
    isSeated,
    onAsphalt: onAsphalt.slice(0, 3)
  }).toEqual({ hasMovedBuilding: true, hasCrossedStreet: true, isSeated: true, onAsphalt: [] })
})
