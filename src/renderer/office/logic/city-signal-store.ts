import { useSyncExternalStore } from 'react'
import { dayKey } from '../../../shared/day-key'
import type { OfficeFrame } from '../scene-model'
import {
  type BuildingId,
  type BuildingSignal,
  citySignals,
  createDayLedger,
  type LeaderRow,
  observeDay,
  type CitySignals,
  type DayLedger
} from './city-signals'
import { createSubscribers } from './subscribers'

export interface CitySignalStore {
  update(frame: OfficeFrame | null, nowMs: number): void
  current(): CitySignals
  // Bumps on any change the HUD shows, today's tokens included.
  version(): number
  // Bumps only when something the scene draws changed: a stage, never a token count alone.
  sceneVersion(): number
  // Each building's reached spire stage; the same Map until one changes.
  spireStages(): ReadonlyMap<BuildingId, number>
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

function isSameMap<Value>(
  a: ReadonlyMap<string, Value>,
  b: ReadonlyMap<string, Value>,
  isSame: (x: Value, y: Value) => boolean
): boolean {
  if (a.size !== b.size) return false
  for (const [key, value] of a) {
    const other = b.get(key)
    if (other === undefined || !isSame(value, other)) return false
  }
  return true
}

// Every field but `ignored`; the signals' fields are all primitives.
function isSameFields<Value extends object>(a: Value, b: Value, ignored?: keyof Value): boolean {
  for (const field in a) if (field !== ignored && !Object.is(a[field], b[field])) return false
  return true
}

const isSameRow = (a: LeaderRow | null, b: LeaderRow | null): boolean =>
  a === b || (a !== null && b !== null && isSameFields(a, b))

const isSameScene = (a: CitySignals, b: CitySignals): boolean =>
  isSameMap(a.buildings, b.buildings, (x, y) => isSameFields(x, y, 'tokensToday')) &&
  a.leaders.crowned.length === b.leaders.crowned.length &&
  a.leaders.crowned.every((key, index) => key === b.leaders.crowned[index])

// A running session's age grows every tick; only who leads it is a change.
const isSameHud = (a: CitySignals, b: CitySignals): boolean =>
  isSameMap(a.buildings, b.buildings, (x, y) => x.tokensToday === y.tokensToday) &&
  isSameMap(a.companies, b.companies, isSameFields) &&
  isSameRow(a.leaders.topSpender, b.leaders.topSpender) &&
  isSameRow(a.leaders.busiestProject, b.leaders.busiestProject) &&
  isSameRow(a.leaders.mostCrew, b.leaders.mostCrew) &&
  a.leaders.longestRunning?.key === b.leaders.longestRunning?.key

const reachedStages = (buildings: ReadonlyMap<BuildingId, BuildingSignal>) =>
  new Map(
    [...buildings].flatMap(([id, { spireStage }]) => (spireStage > 0 ? [[id, spireStage]] : []))
  )

export function createCitySignalStore(): CitySignalStore {
  const { subscribe, notify } = createSubscribers()
  let day: DayLedger | null = null
  let signals = EMPTY
  let stages: ReadonlyMap<BuildingId, number> = new Map()
  let version = 0
  let sceneVersion = 0
  return {
    update(frame, nowMs) {
      if (!frame) return
      day = observeDay(day ?? createDayLedger(dayKey(nowMs)), frame.sessions, nowMs)
      const previous = signals
      signals = citySignals(frame, day, nowMs)
      const isSceneSame = isSameScene(previous, signals)
      if (isSceneSame && isSameHud(previous, signals)) return
      version += 1
      if (!isSceneSame) {
        sceneVersion += 1
        const next = reachedStages(signals.buildings)
        if (!isSameMap(stages, next, Object.is)) stages = next
      }
      notify()
    },
    current: () => signals,
    version: () => version,
    sceneVersion: () => sceneVersion,
    spireStages: () => stages,
    subscribe
  }
}

// The page's signals: fed at the Office root, read by layers in their frame loop.
export const citySignalStore = createCitySignalStore()

// Spires build into the building batch, so the scene re-renders only when a stage is reached.
export function useSpireStages(
  store: Pick<CitySignalStore, 'spireStages' | 'subscribe'> = citySignalStore
): ReadonlyMap<string, number> {
  return useSyncExternalStore(store.subscribe, store.spireStages)
}
