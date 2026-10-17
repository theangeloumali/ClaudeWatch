import { Group, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three'
import { dayKey } from '../../../../shared/day-key'
import type { AgentObservation, SessionRef, SessionUsage } from '../../../../shared/office/types'
import type { CityEvent } from '../../../office-live/city-events'
import { createBuildingPlaces, type PlaceTop } from '../../logic/building-place'
import { buildingIdOf, citySignals, createDayLedger } from '../../logic/city-signals'
import { makeFrame, makeSession } from '../../__tests__/fixtures'
import type { CityMarkFrame } from '../city-marks'

export const NOW = new Date(2026, 9, 17, 12).getTime()
export const HOME = buildingIdOf('c_test', 'p_1')
export const ROOF: PlaceTop = { x: 12, y: 9, z: -6 }

const FRESH: AgentObservation = {
  sourceId: 'claude',
  observedAtMs: NOW - 1_000,
  staleAfterMs: 60_000,
  coverage: 'own'
}

export const usage = (input: number): SessionUsage => ({
  own: { input, output: 0, cacheWrite: 0, cacheRead: 0 },
  subagents: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
  spawned: 0,
  contextTokens: null,
  contextLimit: null
})

// Started this morning, so every token a session spent counts toward today.
const MORNING = NOW - 3_600_000

export const live = (key: string, overrides: Partial<SessionRef> = {}): SessionRef =>
  makeSession({ key, observation: FRESH, usage: null, startedAtMs: MORNING, ...overrides })

export const stale = (key: string, overrides: Partial<SessionRef> = {}): SessionRef =>
  makeSession({
    key,
    usage: null,
    startedAtMs: MORNING,
    observation: { ...FRESH, observedAtMs: NOW - 120_000 },
    ...overrides
  })

let signalsVersion = 0

// One drawn frame of the city, from real signals and a real place store.
export function markFrame(options: {
  sessions: readonly SessionRef[]
  events?: readonly CityEvent[]
  nowMs?: number
  isPinned?: boolean
  zoom?: number
  band?: CityMarkFrame['band']
  roofs?: ReadonlyMap<string, PlaceTop>
}): CityMarkFrame {
  const nowMs = options.nowMs ?? NOW
  const places = createBuildingPlaces()
  for (const [id, roof] of options.roofs ?? new Map([[HOME, ROOF]])) places.setRoof(id, roof)
  const frame = makeFrame({ sessions: [...options.sessions] })
  return {
    signals: citySignals(frame, createDayLedger(dayKey(NOW)), NOW),
    // Every test frame is its own signals, so no sites scan carries over.
    signalsVersion: (signalsVersion += 1),
    events: options.events ?? [],
    topOf: (id) => places.topAt(id, nowMs, options.isPinned ?? false),
    nowMs,
    isPinned: options.isPinned ?? false,
    zoom: options.zoom ?? 8,
    band: options.band ?? 'building'
  }
}

export const cityEvent = (overrides: Partial<CityEvent> & Pick<CityEvent, 'kind'>): CityEvent => ({
  id: `claude:a:${overrides.kind}`,
  buildingId: HOME,
  sessionKey: 'claude:a',
  atMs: NOW,
  ...overrides
})

export function layerScene(mesh: InstancedMesh): Group {
  const scene = new Group()
  scene.add(mesh)
  return scene
}

export interface Placed {
  position: Vector3
  scale: Vector3
}

// Where each drawn instance stands, in drawn order.
export function placed(mesh: InstancedMesh): Placed[] {
  const matrix = new Matrix4()
  return Array.from({ length: mesh.visible ? mesh.count : 0 }, (_, index) => {
    mesh.getMatrixAt(index, matrix)
    const position = new Vector3()
    const scale = new Vector3()
    matrix.decompose(position, new Quaternion(), scale)
    return { position, scale }
  })
}
