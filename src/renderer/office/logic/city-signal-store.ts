import { dayKey } from '../../../shared/day-key'
import type { OfficeFrame } from '../scene-model'
import {
  citySignals,
  createDayLedger,
  observeDay,
  type CitySignals,
  type DayLedger
} from './city-signals'

export interface CitySignalStore {
  update(frame: OfficeFrame | null, nowMs: number): void
  current(): CitySignals
  // Bumps only when a signal changed, so scene layers re-pose on a change, not on a tick.
  version(): number
}

const EMPTY: CitySignals = {
  buildings: new Map(),
  leaders: {
    crowned: [],
    topSpender: null,
    busiestProject: null,
    longestRunning: null,
    mostCrew: null
  },
  companies: new Map()
}

// A running session's age grows every tick; only who leads it is a change.
const fingerprint = ({ buildings, leaders, companies }: CitySignals): string =>
  JSON.stringify([
    [...buildings],
    { ...leaders, longestRunning: leaders.longestRunning?.key ?? null },
    [...companies]
  ])

export function createCitySignalStore(): CitySignalStore {
  let day: DayLedger | null = null
  let signals = EMPTY
  let print = fingerprint(EMPTY)
  let version = 0
  return {
    update(frame, nowMs) {
      if (!frame) return
      day = observeDay(day ?? createDayLedger(dayKey(nowMs)), frame.sessions, nowMs)
      signals = citySignals(frame, day, nowMs)
      const nextPrint = fingerprint(signals)
      if (nextPrint === print) return
      print = nextPrint
      version += 1
    },
    current: () => signals,
    version: () => version
  }
}

// The page's signals: fed once per frame at the Office root, read by layers in their frame loop.
export const citySignalStore = createCitySignalStore()
