import { useMemo, useSyncExternalStore } from 'react'
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
  subscribe(listener: () => void): () => void
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
  const listeners = new Set<() => void>()
  return {
    update(frame, nowMs) {
      if (!frame) return
      day = observeDay(day ?? createDayLedger(dayKey(nowMs)), frame.sessions, nowMs)
      signals = citySignals(frame, day, nowMs)
      const nextPrint = fingerprint(signals)
      if (nextPrint === print) return
      print = nextPrint
      version += 1
      for (const listener of listeners) listener()
    },
    current: () => signals,
    version: () => version,
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    }
  }
}

// The page's signals: fed once per frame at the Office root, read by layers in their frame loop.
export const citySignalStore = createCitySignalStore()

const stagesKey = (signals: CitySignals): string =>
  JSON.stringify(
    [...signals.buildings]
      .filter(([, signal]) => signal.spireStage > 0)
      .map(([buildingId, signal]) => [buildingId, signal.spireStage])
      .sort()
  )

// Spires build into the building batch, so the scene re-renders only when a stage is reached.
export function useSpireStages(
  store: Pick<CitySignalStore, 'current' | 'subscribe'> = citySignalStore
): ReadonlyMap<string, number> {
  const key = useSyncExternalStore(store.subscribe, () => stagesKey(store.current()))
  return useMemo(() => new Map(JSON.parse(key) as [string, number][]), [key])
}
