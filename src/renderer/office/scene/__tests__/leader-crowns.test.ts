import { Box3, InstancedMesh, Matrix4, OrthographicCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { createPoseStore } from '../../../office-live/pose-store'
import type {
  AgentObservation,
  AgentView,
  SessionRef,
  SessionUsage
} from '../../../../shared/office/types'
import { makeAgent, makeFrame, makeSession } from '../../__tests__/fixtures'
import { createBuildingPlaces } from '../../logic/building-place'
import {
  BAND_ZOOM,
  ISO_POLAR,
  ISO_START_AZIMUTH,
  MAX_INSPECTION_ZOOM
} from '../../logic/camera-bands'
import { createCitySignalStore } from '../../logic/city-signal-store'
import { CITY_LAYER_BUDGET, measureLayer } from '../../themes/city-layer-budget.test-utils'
import { listThemes, themeForTeam } from '../../themes/registry'
import { MARK_RISE_M } from '../city-marks'
import { CARD_HEIGHT } from '../CardProjector'
import { coplanarConflicts, partBoxes } from './coplanar.test-utils'
import {
  createLeaderCrownsLayer,
  crownParts,
  NAME_CARD_MAX_PX,
  type CrownFrame
} from '../leader-crowns-layer'

const NOW = new Date(2026, 9, 17, 12).getTime()
const VIEW = { width: 1280, height: 800 }
const ZOOMS = [0.5, 2, BAND_ZOOM.building, 20, BAND_ZOOM.floor, BAND_ZOOM.desk, MAX_INSPECTION_ZOOM]
// Where 12 m of headroom holds a crown above a full card; further out the ceiling wins.
const CARD_ZOOMS = new Set([20, BAND_ZOOM.floor, BAND_ZOOM.desk, MAX_INSPECTION_ZOOM])
// Below 14 px ÷ 19 m (zoom ≈ 0.74) a 0.6-tall crown would clear MARK_RISE_M, so metres cap it.
const CAPPED_ZOOMS = new Set([0.5])
const palette = themeForTeam().palette

function cameraAt(azimuth: number, zoom: number): OrthographicCamera {
  const camera = new OrthographicCamera(
    -VIEW.width / 2,
    VIEW.width / 2,
    VIEW.height / 2,
    -VIEW.height / 2,
    1,
    400
  )
  camera.zoom = zoom
  camera.position.set(
    120 * Math.sin(ISO_POLAR) * Math.sin(azimuth),
    120 * Math.cos(ISO_POLAR),
    120 * Math.sin(ISO_POLAR) * Math.cos(azimuth)
  )
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  return camera
}

const crownFrame = (overrides: Partial<CrownFrame> = {}): CrownFrame => ({
  crowned: [],
  agents: new Map(),
  buildingOf: () => null,
  places: createBuildingPlaces(),
  poses: createPoseStore(),
  camera: cameraAt(ISO_START_AZIMUTH, BAND_ZOOM.floor),
  nowMs: NOW,
  isPinned: false,
  ...overrides
})

const agentsOf = (...agents: AgentView[]) =>
  new Map(agents.map((agent) => [agent.agentKey, agent] as const))

interface ShownCrown {
  centre: Vector3
  // The crown's own box corners, turned and scaled as drawn.
  corners: Vector3[]
}

function crownsShown(layer: ReturnType<typeof createLeaderCrownsLayer>): ShownCrown[] {
  // The drawn geometry, centred on the crown's middle, not the parts' unshifted spec.
  const { geometry } = layer.mesh
  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox
  if (!bounds) throw new Error('a crown geometry has bounds')
  const local = [bounds.min.x, bounds.max.x].flatMap((x) =>
    [bounds.min.y, bounds.max.y].flatMap((y) =>
      [bounds.min.z, bounds.max.z].map((z) => new Vector3(x, y, z))
    )
  )
  const matrix = new Matrix4()
  const shown: ShownCrown[] = []
  for (let index = 0; index < layer.mesh.count; index += 1) {
    layer.mesh.getMatrixAt(index, matrix)
    if (matrix.elements.slice(0, 12).every((value) => value === 0)) continue
    const corners = local.map((corner) => corner.clone().applyMatrix4(matrix))
    const centre = new Box3().setFromPoints(corners).getCenter(new Vector3())
    shown.push({ centre, corners })
  }
  return shown
}

// The crown on screen, in pixels from the top left.
function screenRect({ corners }: ShownCrown, camera: OrthographicCamera) {
  const points = corners.map((corner) => corner.clone().project(camera))
  const xs = points.map((point) => ((point.x + 1) / 2) * VIEW.width)
  const ys = points.map((point) => ((1 - point.y) / 2) * VIEW.height)
  return { width: Math.max(...xs) - Math.min(...xs), bottom: Math.max(...ys) }
}

const counts = (input: number) => ({ input, output: 0, cacheWrite: 0, cacheRead: 0 })
const usage = (tokens: number): SessionUsage => ({
  own: counts(tokens),
  subagents: counts(0),
  spawned: 0,
  contextTokens: null,
  contextLimit: null
})
const fresh: AgentObservation = {
  sourceId: 'claude',
  observedAtMs: NOW - 1_000,
  staleAfterMs: 60_000,
  coverage: 'own'
}
const spender = (key: string, tokens: number | null): SessionRef =>
  makeSession({
    key,
    activity: 'editing',
    observation: fresh,
    // Started this morning, so every token counts toward today.
    startedAtMs: NOW - 3_600_000,
    usage: tokens === null ? null : usage(tokens)
  })
const roster = (sessions: readonly SessionRef[]) =>
  agentsOf(...sessions.map((session, index) => makeAgent({ agentKey: session.key, x: index * 4 })))

function crownedBy(sessions: readonly SessionRef[]): readonly string[] {
  const store = createCitySignalStore()
  store.update(makeFrame({ sessions: [...sessions] }), NOW)
  return store.current().leaders.crowned
}

describe('leader crowns', () => {
  it('the top three leaders wear crowns, 1 draw', () => {
    const sessions = [
      spender('claude:a', 4e6),
      spender('claude:b', 3e6),
      spender('claude:c', 2e6),
      spender('claude:d', 1e6)
    ]
    const layer = createLeaderCrownsLayer(palette)
    layer.update(crownFrame({ crowned: crownedBy(sessions), agents: roster(sessions) }))
    const shown = crownsShown(layer)
    expect(shown).toHaveLength(3)
    expect(shown.map((crown) => Math.round(crown.centre.x))).toEqual([0, 4, 8])
    expect(measureLayer(layer.group).draws).toBe(1)
    expect(CITY_LAYER_BUDGET.crowns.draws.full).toBe(1)
  })

  it('a crown over a roaming agent follows its live pose', () => {
    const roamer = makeAgent({ agentKey: 'claude:a', x: 0, z: 0, venueId: 'venue:arcade' })
    const poses = createPoseStore()
    const layer = createLeaderCrownsLayer(palette)
    const frame = crownFrame({ crowned: ['claude:a'], agents: agentsOf(roamer), poses })
    layer.update(frame)
    poses.write('claude:a', { x: 30, z: -12, heading: 0, elevation: 0 })
    layer.update(frame)
    const [crown] = crownsShown(layer)
    const { centre } = crown
    expect(centre.x).toBeCloseTo(30)
    expect(centre.z).toBeCloseTo(-12)
  })

  it("a crown spans 14–32 px on screen at every zoom band and never covers its robot's name card", () => {
    const leader = makeAgent({ agentKey: 'claude:a', x: 3, z: -2, elevation: 5.5 })
    for (const zoom of ZOOMS)
      for (let turn = 0; turn < 4; turn += 1) {
        const camera = cameraAt(ISO_START_AZIMUTH + (turn * Math.PI) / 2, zoom)
        const layer = createLeaderCrownsLayer(palette)
        layer.update(crownFrame({ crowned: ['claude:a'], agents: agentsOf(leader), camera }))
        const [crown] = crownsShown(layer)
        const { width, bottom } = screenRect(crown, camera)
        if (!CAPPED_ZOOMS.has(zoom)) expect(width).toBeGreaterThanOrEqual(14 - 1e-3)
        expect(width).toBeLessThanOrEqual(32 + 1e-3)
        const card = new Vector3(3, 5.5 + CARD_HEIGHT, -2).project(camera)
        const cardTop = ((1 - card.y) / 2) * VIEW.height - NAME_CARD_MAX_PX
        if (CARD_ZOOMS.has(zoom)) expect(bottom).toBeLessThan(cardTop)
      }
  })

  it('a crown never rises more than MARK_RISE_M over its roof, or its card when it roams', () => {
    const places = createBuildingPlaces()
    places.setRoof('home', { x: 3, y: 12, z: -2 })
    const seated = makeAgent({ agentKey: 'claude:a', x: 3, z: -2, elevation: 5.5 })
    const roamer = makeAgent({ agentKey: 'claude:b', x: 9, z: 4, venueId: 'venue:arcade' })
    for (const zoom of ZOOMS) {
      const camera = cameraAt(ISO_START_AZIMUTH, zoom)
      const layer = createLeaderCrownsLayer(palette)
      layer.update(
        crownFrame({
          crowned: ['claude:a', 'claude:b'],
          agents: agentsOf(seated, roamer),
          buildingOf: (key) => (key === 'claude:a' ? 'home' : null),
          places,
          camera
        })
      )
      const crowns = crownsShown(layer)
      const [overRoof, overRoamer] = crowns.map((crown) =>
        Math.max(...crown.corners.map((corner) => corner.y))
      )
      expect(overRoof).toBeLessThanOrEqual(12 + MARK_RISE_M + 1e-6)
      expect(Math.min(...crowns[0].corners.map((corner) => corner.y))).toBeGreaterThan(12)
      expect(overRoamer).toBeLessThanOrEqual(CARD_HEIGHT + MARK_RISE_M + 1e-6)
      // Out here the caps bind: card clearance would lift the crown past its ceiling.
      if (!CARD_ZOOMS.has(zoom)) expect(overRoamer).toBeCloseTo(CARD_HEIGHT + MARK_RISE_M)
      if (CAPPED_ZOOMS.has(zoom)) expect(screenRect(crowns[1], camera).width).toBeLessThan(14)
    }
  })

  it('nobody wears a crown before a token is spent today, and a zero never wins one', () => {
    const idle = [spender('claude:a', null), spender('claude:b', 0)]
    const layer = createLeaderCrownsLayer(palette)
    layer.update(crownFrame({ crowned: crownedBy(idle), agents: roster(idle) }))
    expect(crownsShown(layer)).toHaveLength(0)
    const spent = [spender('claude:a', null), spender('claude:b', 0), spender('claude:c', 1)]
    layer.update(crownFrame({ crowned: crownedBy(spent), agents: roster(spent) }))
    expect(crownsShown(layer)).toHaveLength(1)
  })

  it('a tie goes to the smaller agent key, whatever the roster order', () => {
    const tied = ['claude:d', 'claude:b', 'claude:a', 'claude:c'].map((key) => spender(key, 2e6))
    expect(crownedBy(tied)).toEqual(['claude:a', 'claude:b', 'claude:c'])
    expect(crownedBy([...tied].reverse())).toEqual(['claude:a', 'claude:b', 'claude:c'])
    const layer = createLeaderCrownsLayer(palette)
    layer.update(crownFrame({ crowned: crownedBy(tied), agents: roster(tied) }))
    // The roster puts claude:d first, at x 0: it wears none.
    const xs = crownsShown(layer).map((crown) => Math.round(crown.centre.x))
    expect(xs.sort((a, b) => a - b)).toEqual([4, 8, 12])
  })

  it('a still frame uploads nothing, and a leaving leader drops its crown', () => {
    const leader = makeAgent({ agentKey: 'claude:a' })
    const layer = createLeaderCrownsLayer(palette)
    const frame = crownFrame({ crowned: ['claude:a'], agents: agentsOf(leader) })
    layer.update(frame)
    measureLayer(layer.group)
    layer.update(frame)
    expect(measureLayer(layer.group).uploadBytes).toBe(0)
    layer.update({ ...frame, agents: agentsOf({ ...leader, place: 'leaving' }) })
    expect(crownsShown(layer)).toHaveLength(0)
    expect(measureLayer(layer.group).uploadBytes).toBe(16 * 4)
  })

  it('no crown part shares a plane with another of a different colour', () => {
    for (const theme of listThemes())
      expect(coplanarConflicts(partBoxes('crown', crownParts(theme.palette), [0, 0, 0]))).toEqual(
        []
      )
  })

  it('stays out of every batch: the crown is its own instanced draw', () => {
    const layer = createLeaderCrownsLayer(palette)
    expect(layer.mesh).toBeInstanceOf(InstancedMesh)
    expect(layer.mesh.material).not.toBeInstanceOf(Array)
  })
})
