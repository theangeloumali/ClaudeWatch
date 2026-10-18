import { describe, expect, it } from 'vitest'
import { citySignalStore } from '../../logic/city-signal-store'
import { buildingIdOf, type BuildingSignal } from '../../logic/city-signals'
import { makeFrame } from '../../__tests__/fixtures'
import { markSites, readCityMarks } from '../city-marks'
import { HOME, live, markFrame, NOW, ROOF } from './city-marks.test-utils'

const AWAY = buildingIdOf('c_test', 'p_2')
const needsYou = (signal: BuildingSignal): boolean => signal.needsYou
const sessions = [
  live('claude:a', { attention: 'permission' }),
  live('claude:b', { projectKey: 'p_2', attention: 'question' })
]

describe('mark sites', () => {
  it('a building with no roof takes no mark slot', () => {
    const [, second] = [HOME, AWAY].sort()
    const frame = markFrame({ sessions, roofs: new Map([[second, ROOF]]) })
    expect(markSites(frame, needsYou, 1)).toEqual([second])
  })

  it('a roof that lands later is scanned again', () => {
    const frame = markFrame({ sessions, roofs: new Map() })
    expect(markSites(frame, needsYou, 2)).toEqual([])
    const roofed = { ...frame, topOf: () => ROOF, placesVersion: frame.placesVersion + 1 }
    expect(markSites(roofed, needsYou, 2)).toEqual([HOME, AWAY].sort())
  })

  it('a token-only update keeps the version the sites scan is cached on', () => {
    const spent = (tokens: number) =>
      makeFrame({ sessions: [live('claude:a')], projectsToday: [{ projectKey: 'p_1', tokens }] })
    citySignalStore.update(spent(1_200_000), NOW)
    const { signalsVersion } = readCityMarks('building', 8)
    citySignalStore.update(spent(1_300_000), NOW + 500)
    expect(readCityMarks('building', 8).signalsVersion).toBe(signalsVersion)
  })
})
