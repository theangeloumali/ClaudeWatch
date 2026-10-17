import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Vector3
} from 'three'
import { describe, expect, it } from 'vitest'
import type { AgentObservation, SessionRef, SessionUsage } from '../../../../shared/office/types'
import { CITY_EVENT_LIFE_MS, createCityEventLog } from '../../../office-live/city-events'
import { makeFloor, makeSession } from '../../__tests__/fixtures'
import { createBuildingPlaces } from '../../logic/building-place'
import { buildingIdOf } from '../../logic/city-signals'
import { SPIRE_BASE_GAP_M, spireHeight, stageFor } from '../../logic/token-spires'
import type { FloorGeometry } from '../../scene-model'
import { CITY_LAYER_BUDGET, measureLayer } from '../../themes/city-layer-budget.test-utils'
import { themeForTeam } from '../../themes/registry'
import { createBatchRoot, createMeshBatches } from '../mesh-batches'
import { createConstructionRigLayer, type RigFrame } from '../construction-rig-layer'

const T0 = new Date(2026, 9, 17, 12).getTime()
const HOME = buildingIdOf('c_test', 'p_1')
const ROOF = { x: 10, y: 6.5, z: -4 }
const tower: FloorGeometry[] = [
  { ...makeFloor({ floorId: 'g', buildingId: HOME, x: 10, z: -4 }), entrance: { x: 10, z: -12 } }
]

const usage = (tokens: number): SessionUsage => ({
  own: { input: tokens, output: 0, cacheWrite: 0, cacheRead: 0 },
  subagents: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
  spawned: 0,
  contextTokens: null,
  contextLimit: null
})
const seenAt = (atMs: number): AgentObservation => ({
  sourceId: 'claude',
  observedAtMs: atMs,
  staleAfterMs: 60_000,
  coverage: 'own'
})
const at = (atMs: number, tokens: number): SessionRef =>
  makeSession({
    key: 'claude:a',
    observation: seenAt(atMs),
    updatedAtMs: atMs,
    usage: usage(tokens)
  })
const day = (tokens: number) => [{ projectKey: 'p_1', tokens }]

function placesWithRoof() {
  const places = createBuildingPlaces()
  places.setRoof(HOME, ROOF)
  return places
}

const rigFrame = (overrides: Partial<RigFrame>): RigFrame => ({
  events: [],
  floorsOf: (buildingId) => (buildingId === HOME ? tower : undefined),
  places: placesWithRoof(),
  nowMs: T0,
  isPinned: false,
  level: 'full',
  ...overrides
})

const shownIn = (mesh: InstancedMesh): number => {
  const matrix = new Matrix4()
  let shown = 0
  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getMatrixAt(index, matrix)
    if (!matrix.elements.slice(0, 12).every((value) => value === 0)) shown += 1
  }
  return mesh.material instanceof Array || !mesh.material.visible ? 0 : shown
}

// A spire crossing from 1.9M to 2.1M today, seen live between two patches.
function crossingLog() {
  const log = createCityEventLog()
  log.observe('hello', [at(T0, 1.9e6)], T0, day(1.9e6))
  log.observe('patch', [at(T0 + 1, 2.1e6)], T0 + 1, day(2.1e6))
  return log
}

describe('construction rig', () => {
  it('a stage crossing raises a rig for 3 s, then nothing', () => {
    const log = crossingLog()
    const layer = createConstructionRigLayer(themeForTeam())
    const frameAt = (nowMs: number) => rigFrame({ events: log.active(nowMs), nowMs })
    layer.update(frameAt(T0 + 1 + 1_500))
    expect(shownIn(layer.rig)).toBeGreaterThan(0)
    expect(shownIn(layer.module)).toBe(1)
    expect(measureLayer(layer.group).draws).toBe(2)
    expect(CITY_LAYER_BUDGET.rig).toMatchObject({ isTransient: true, draws: { full: 2 } })
    layer.update(frameAt(T0 + 1 + CITY_EVENT_LIFE_MS.hoist))
    expect(shownIn(layer.rig)).toBe(0)
    expect(shownIn(layer.module)).toBe(0)
    measureLayer(layer.group)
    layer.update(frameAt(T0 + 1 + CITY_EVENT_LIFE_MS.hoist + 500))
    expect(measureLayer(layer.group).uploadBytes).toBe(0)
  })

  it('a hello shows the finished spire with no rig', () => {
    const log = createCityEventLog()
    log.observe('hello', [at(T0, 5e6)], T0, day(5e6))
    const places = placesWithRoof()
    places.setStage(HOME, stageFor(5e6), T0)
    expect(places.place(HOME).topAt(T0, false)?.y).toBeCloseTo(
      ROOF.y + SPIRE_BASE_GAP_M + spireHeight(stageFor(5e6))
    )
    const layer = createConstructionRigLayer(themeForTeam())
    layer.update(rigFrame({ events: log.active(T0 + 100), nowMs: T0 + 100, places }))
    expect(shownIn(layer.rig)).toBe(0)
    expect(shownIn(layer.module)).toBe(0)
  })

  it('reduced motion skips the hoist', () => {
    const log = crossingLog()
    const layer = createConstructionRigLayer(themeForTeam())
    layer.update(rigFrame({ events: log.active(T0 + 500), nowMs: T0 + 500, isPinned: true }))
    expect(shownIn(layer.rig)).toBe(0)
    expect(shownIn(layer.module)).toBe(0)
  })

  it('stepping quality mid-hoist rebuilds no static batch', () => {
    const city = createBatchRoot()
    const block = new BoxGeometry(1, 1, 1)
    const paint = new MeshStandardMaterial({ color: '#8a6f3a' })
    for (const x of [0, 4, 8]) {
      const lot = new Mesh(block, paint)
      lot.position.x = x
      city.add(lot)
    }
    const [batch] = createMeshBatches(city)
    const batchVersion = batch.mesh.instanceMatrix.version
    const scene = new Group()
    const layer = createConstructionRigLayer(themeForTeam())
    scene.add(city, layer.group)
    const log = crossingLog()
    const frameAt = (nowMs: number, level: RigFrame['level']) =>
      rigFrame({ events: log.active(nowMs), nowMs, level })
    layer.update(frameAt(T0 + 800, 'full'))
    expect(measureLayer(layer.group).draws).toBe(2)
    layer.update(frameAt(T0 + 1_200, 'light'))
    expect(measureLayer(layer.group).draws).toBe(CITY_LAYER_BUDGET.rig.draws.light)
    layer.update(frameAt(T0 + 1_600, 'balanced'))
    expect(measureLayer(layer.group).draws).toBe(CITY_LAYER_BUDGET.rig.draws.balanced)
    expect(city.children.filter((child) => child instanceof InstancedMesh)).toEqual([batch.mesh])
    expect(batch.mesh.instanceMatrix.version).toBe(batchVersion)
  })

  it("a gain under 0.5% of the project's day raises no rig", () => {
    const log = createCityEventLog()
    log.observe('hello', [at(T0, 4e6)], T0, day(4e6))
    // The precondition: this patch does cross a spire stage.
    expect(stageFor(5_000_001)).toBeGreaterThan(stageFor(4_999_990))
    log.observe('patch', [at(T0 + 1, 4_999_990)], T0 + 1, day(4_999_990))
    log.observe('patch', [at(T0 + 2, 5_000_001)], T0 + 2, day(5_000_001))
    const layer = createConstructionRigLayer(themeForTeam())
    layer.update(rigFrame({ events: log.active(T0 + 500), nowMs: T0 + 500 }))
    expect(shownIn(layer.rig)).toBe(0)
    expect(shownIn(layer.module)).toBe(0)
  })

  it('the crane stands on the side away from the entrance, and the module lands on the spire', () => {
    const log = crossingLog()
    const layer = createConstructionRigLayer(themeForTeam())
    const events = log.active(T0 + 1)
    const [event] = events
    layer.update(rigFrame({ events, nowMs: event.atMs + 100 }))
    const mast = new Vector3()
    const matrix = new Matrix4()
    layer.rig.getMatrixAt(0, matrix)
    mast.setFromMatrixPosition(matrix)
    // The entrance faces -z (north); the crane stands behind the building, past its back wall.
    expect(mast.z).toBeGreaterThan(-4 + tower[0].depth / 2)
    const module = new Vector3()
    layer.update(rigFrame({ events, nowMs: event.atMs + CITY_EVENT_LIFE_MS.hoist * 0.75 }))
    layer.module.getMatrixAt(0, matrix)
    module.setFromMatrixPosition(matrix)
    expect(module.x).toBeCloseTo(ROOF.x)
    expect(module.z).toBeCloseTo(ROOF.z)
    expect(module.y).toBeGreaterThan(ROOF.y)
  })
})
