import { describe, expect, it, vi } from 'vitest'
import type { AgentView, SessionRef, SourceHealth } from '../../../shared/office/types'
import { LOUNGE_DELAY_MS } from '../behaviour'
import { session } from '../fixtures'
import { TICK_MS } from './door-invariants'
import { CityWorld, SOURCES, idle, isOuting, observed, streetsOf } from './roaming-harness'

// Full sim runs: the 5 s default times out under load (health-9).
vi.setConfig({ testTimeout: 180_000 })

const PROJECT = 'p_roam'

describe('roaming: an agent not working walks the city', () => {
  it('sets an idle agent with its own fresh evidence walking a sidewalk loop within 20 s', () => {
    const city = new CityWorld(idle(1), { hasVenues: false })
    const streets = streetsOf(city.world.layout())
    let setOutAtMs: number | null = null
    let onLoopAtMs: number | null = null
    let walkedMetres = 0
    let previous: AgentView | undefined
    city.run(LOUNGE_DELAY_MS + 60_000, ([view], elapsedMs) => {
      if (view.place === 'lounge') setOutAtMs ??= elapsedMs
      if (onLoopAtMs === null && isOuting(view) && streets.isOnNetwork(view)) onLoopAtMs = elapsedMs
      if (onLoopAtMs !== null && previous)
        walkedMetres += Math.hypot(view.x - previous.x, view.z - previous.z)
      previous = view
      return onLoopAtMs !== null && elapsedMs - onLoopAtMs >= 10_000
    })
    expect(streets.hasStreets).toBe(true)
    expect({
      setsOut: setOutAtMs !== null,
      isOnLoopWithin20s: (onLoopAtMs ?? Infinity) - (setOutAtMs ?? 0) <= 20_000,
      // Walking, not parked at the kerb: ten seconds at 1.4 m/s.
      keepsWalking: walkedMetres > 10
    }).toEqual({ setsOut: true, isOnLoopWithin20s: true, keepsWalking: true })
  })

  // Beside a working agent with its own record, as the observing bridge stamps a live feed.
  // The stale and unhealthy rows already stay home: controls that roaming must keep (owner rule).
  it.each<[string, (nowMs: number) => SessionRef, SourceHealth[]]>([
    [
      'no record of its own',
      () => ({ ...session('claude:unknown', PROJECT), attention: 'done' }),
      SOURCES
    ],
    ['a stale record', (nowMs) => observed('claude:unknown', PROJECT, nowMs - 4_000_000), SOURCES],
    [
      'an unhealthy source',
      (nowMs) => observed('claude:unknown', PROJECT, nowMs),
      [{ id: 'source', ok: false, detail: 'offline' }]
    ]
  ])('keeps an agent with %s at its desk', (_name, unknown, sources) => {
    const worker = (nowMs: number) => ({
      ...observed('claude:worker', PROJECT, nowMs),
      activity: 'thinking' as const
    })
    const city = new CityWorld((nowMs) => [unknown(nowMs), worker(nowMs)], {
      hasVenues: true,
      sources
    })
    const awayAtMs: number[] = []
    city.run(LOUNGE_DELAY_MS + 100_000, (views, elapsedMs) => {
      const view = views.find((candidate) => candidate.agentKey === 'claude:unknown')
      if (!city.isSeated(view)) awayAtMs.push(elapsedMs)
    })
    expect(awayAtMs.slice(0, 3)).toEqual([])
  })

  // One-way sidewalks (A3) can send a returner round the far side of its block, about 95 m
  // in these blocks, so the bound is 90 s rather than the plan's 60 s.
  it('walks a roamer back to its own desk within 90 s of working evidence', () => {
    const city = new CityWorld(idle(1), { hasVenues: false })
    const streets = streetsOf(city.world.layout())
    let roamedMs = 0
    city.run(LOUNGE_DELAY_MS + 60_000, ([view]) => {
      if (isOuting(view) && streets.isOnNetwork(view)) roamedMs += TICK_MS
      return roamedMs >= 10_000
    })
    city.patch(idle(1)(city.clock).map((record) => ({ ...record, activity: 'thinking' as const })))
    let seatedAtMs: number | null = null
    const onAsphalt: string[] = []
    city.run(90_000, ([view], elapsedMs) => {
      if (view.physicalFloorId === null && streets.isOnAsphalt(view))
        onAsphalt.push(`${elapsedMs}: ${view.x.toFixed(2)},${view.z.toFixed(2)}`)
      if (!city.isSeated(view)) return
      seatedAtMs = elapsedMs
      return true
    })
    expect({
      roamed: roamedMs >= 10_000,
      isSeatedWithin90s: seatedAtMs !== null,
      onAsphalt: onAsphalt.slice(0, 3)
    }).toEqual({ roamed: true, isSeatedWithin90s: true, onAsphalt: [] })
  })
})
