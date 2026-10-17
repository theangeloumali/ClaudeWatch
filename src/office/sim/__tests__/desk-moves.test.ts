import { expect, it, vi } from 'vitest'
import { DEPARTURE_FADE_MS, type SessionRef } from '../../../shared/office/types'
import { CityWorld, observed } from './city-harness'
import { TICK_MS } from './door-invariants'

// Full sim runs: the 5 s default times out under load (health-9).
vi.setConfig({ testTimeout: 120_000 })

const working = (key: string, project: string, nowMs: number): SessionRef => ({
  ...observed(key, project, nowMs),
  activity: 'thinking'
})

// Its desk moves to the block across the avenue: it fades out at its old desk and fades in
// at the new one, never stepping into the street.
it('fades an agent across to a desk in another building', () => {
  const city = new CityWorld(
    // An agent stays in each building, so none moves when the mover leaves; p_mid puts p_to
    // in the third lot, north of the avenue.
    (nowMs) => [
      working('claude:mover', 'p_from', nowMs),
      working('claude:stays', 'p_from', nowMs),
      working('claude:between', 'p_mid', nowMs),
      working('claude:anchor', 'p_to', nowMs)
    ]
  )
  const home = city.world.step(0).find((view) => view.agentKey === 'claude:mover')!
  city.patch([working('claude:mover', 'p_to', city.clock)])
  const samples: { x: number; z: number; physicalFloorId?: string | null; fade?: number }[] = []
  let seatedAtMs: number | null = null
  city.run(5_000, (views, elapsedMs) => {
    const view = views.find((candidate) => candidate.agentKey === 'claude:mover')!
    samples.push(view)
    if (city.isSeated(view) && view.fade === undefined) seatedAtMs ??= elapsedMs
  })
  const fadingAway = samples.filter((sample) => sample.physicalFloorId === home.physicalFloorId)
  const moved = samples.at(-1)
  expect({
    hasMovedBuilding: moved?.physicalFloorId !== home.physicalFloorId,
    isNeverOutside: samples.every((sample) => sample.physicalFloorId !== null),
    isStillWhileFading: fadingAway.every((sample) => sample.x === home.x && sample.z === home.z),
    isFadedUntilSeated: fadingAway.every((sample) => sample.fade !== undefined),
    isSeatedWithinOneFade: seatedAtMs !== null && seatedAtMs <= DEPARTURE_FADE_MS + TICK_MS
  }).toEqual({
    hasMovedBuilding: true,
    isNeverOutside: true,
    isStillWhileFading: true,
    isFadedUntilSeated: true,
    isSeatedWithinOneFade: true
  })
})
