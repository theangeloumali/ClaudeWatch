import { describe, expect, it, vi } from 'vitest'
import type { BuildingSignal, CitySignals } from '../../logic/city-signals'
import { createSpireStageFeed } from '../SpireStageFeed'

const building = (spireStage: number): BuildingSignal => ({
  tokensToday: null,
  spireStage,
  needsYou: false,
  asks: null,
  hasError: false,
  isLimited: false,
  isDone: false,
  busiestCategory: null,
  hasEvidence: true
})

function signalsWith(stages: Record<string, number>): CitySignals {
  return {
    buildings: new Map(Object.entries(stages).map(([id, stage]) => [id, building(stage)])),
    leaders: {
      crowned: [],
      topSpender: null,
      busiestProject: null,
      longestRunning: null,
      mostCrew: null
    },
    companies: new Map()
  }
}

describe('createSpireStageFeed', () => {
  it('hands each building its spire stage at the city clock’s time when the signals change', () => {
    let version = 1
    let current = signalsWith({ a: 2, b: 0 })
    const setStage = vi.fn()
    const sync = createSpireStageFeed(
      { current: () => current, sceneVersion: () => version },
      { setStage },
      { now: () => 5_000 }
    )
    sync()
    expect(setStage.mock.calls).toEqual([
      ['a', 2, 5_000],
      ['b', 0, 5_000]
    ])
    current = signalsWith({ a: 3, b: 0 })
    version = 2
    sync()
    expect(setStage).toHaveBeenLastCalledWith('b', 0, 5_000)
    expect(setStage).toHaveBeenCalledWith('a', 3, 5_000)
  })

  it('does nothing on a frame where no signal changed', () => {
    const setStage = vi.fn()
    const sync = createSpireStageFeed(
      { current: () => signalsWith({ a: 1 }), sceneVersion: () => 7 },
      { setStage },
      { now: () => 0 }
    )
    sync()
    sync()
    sync()
    expect(setStage).toHaveBeenCalledTimes(1)
  })

  // Today's tokens move the HUD's version on every tick; only a drawn change moves the scene's.
  it('a token tick alone does not re-feed the stages', () => {
    let version = 1
    const store = {
      current: () => signalsWith({ a: 1 }),
      version: () => version,
      sceneVersion: () => 4
    }
    const setStage = vi.fn()
    const sync = createSpireStageFeed(store, { setStage }, { now: () => 0 })
    sync()
    version = 2
    sync()
    expect(setStage).toHaveBeenCalledTimes(1)
  })
})
