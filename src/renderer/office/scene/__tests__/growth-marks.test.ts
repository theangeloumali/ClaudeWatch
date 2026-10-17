import { InstancedMesh, Matrix4, OrthographicCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { createPoseStore } from '../../../office-live/pose-store'
import { makeAgent, makeFloor } from '../../__tests__/fixtures'
import { createBuildingPlaces } from '../../logic/building-place'
import { BAND_ZOOM, ISO_POLAR, ISO_START_AZIMUTH } from '../../logic/camera-bands'
import { buildingIdOf } from '../../logic/city-signals'
import { SIGN_BOARD } from '../../logic/project-signs'
import { QUALITY_LEVELS } from '../../logic/quality'
import { SPIRE_BASE_GAP_M, SPIRE_MAX_M } from '../../logic/token-spires'
import { CITY_LAYER_BUDGET, measureLayer } from '../../themes/city-layer-budget.test-utils'
import { themeForTeam } from '../../themes/registry'
import { createCitySignsLayer, type SignHost } from '../city-signs-layer'
import { createConstructionRigLayer } from '../construction-rig-layer'
import { createLeaderCrownsLayer } from '../leader-crowns-layer'
import { spireShare } from '../TokenSpire'

const HOME = buildingIdOf('c_test', 'p_1')
const ROOF = { x: 0, y: 10, z: 0 }
const theme = themeForTeam()

function camera(zoom = BAND_ZOOM.floor): OrthographicCamera {
  const view = new OrthographicCamera(-640, 640, 400, -400, 1, 400)
  view.zoom = zoom
  view.position.set(
    120 * Math.sin(ISO_POLAR) * Math.sin(ISO_START_AZIMUTH),
    120 * Math.cos(ISO_POLAR),
    120 * Math.sin(ISO_POLAR) * Math.cos(ISO_START_AZIMUTH)
  )
  view.lookAt(0, 0, 0)
  view.updateProjectionMatrix()
  view.updateMatrixWorld()
  return view
}

const heightOf = (mesh: InstancedMesh, index: number): number => {
  const matrix = new Matrix4()
  mesh.getMatrixAt(index, matrix)
  return new Vector3().setFromMatrixPosition(matrix).y
}

describe('marks on the live roof', () => {
  it('every mark rides a growing spire', () => {
    const places = createBuildingPlaces()
    places.setRoof(HOME, ROOF)
    places.setStage(HOME, 0, 0)
    places.setStage(HOME, 4, 10_000)
    const place = places.place(HOME)
    const view = camera()
    const signs = createCitySignsLayer(null)
    const host: SignHost = {
      key: HOME,
      top: (nowMs, isPinned) => place.topAt(nowMs, isPinned),
      look: { icon: 'edit', board: SIGN_BOARD.working }
    }
    const crowns = createLeaderCrownsLayer(theme.palette)
    const leader = makeAgent({ agentKey: 'claude:a', x: 2, z: 1 })
    const gaps = { sign: new Set<string>(), crown: new Set<string>() }
    let previous = ROOF.y
    for (let step = 0; step <= 12; step += 1) {
      const nowMs = 10_000 + step * 100
      const top = place.topAt(nowMs, false)?.y ?? Number.NaN
      expect(top).toBeGreaterThanOrEqual(previous)
      previous = top
      signs.update({ hosts: [host], camera: view, nowMs, isPinned: false, isCameraMoved: true })
      crowns.update({
        crowned: ['claude:a'],
        agents: new Map([[leader.agentKey, leader]]),
        buildingOf: () => HOME,
        places,
        poses: createPoseStore(),
        camera: view,
        nowMs,
        isPinned: false
      })
      const [disc] = signs.group.children
      if (!(disc instanceof InstancedMesh)) throw new Error('a sign disc')
      gaps.sign.add((heightOf(disc, 0) - top).toFixed(3))
      gaps.crown.add((heightOf(crowns.mesh, 0) - top).toFixed(3))
      // A hidden spire leaves the marks on the bare roof; a standing one tops out where they sit.
      const share = spireShare(place, ROOF.y, nowMs, false)
      const spireTop = share > 0 ? ROOF.y + SPIRE_BASE_GAP_M + share * SPIRE_MAX_M : ROOF.y
      expect(spireTop).toBeCloseTo(top)
    }
    // The precondition: the spire did grow while the marks were read.
    expect(previous).toBeGreaterThan(ROOF.y + SPIRE_MAX_M / 2)
    expect(gaps.sign.size).toBe(1)
    expect(gaps.crown.size).toBe(1)
  })
})

describe('growth layer budgets', () => {
  it('signs, spires, crowns and the rig stay inside their CITY_LAYER_BUDGET rows at every level', () => {
    const view = camera(BAND_ZOOM.building)
    const places = createBuildingPlaces()
    places.setRoof(HOME, ROOF)
    places.setStage(HOME, 3, 0)
    const signs = createCitySignsLayer(null)
    const hosts: SignHost[] = Array.from({ length: 133 }, (_, index) => ({
      key: `b${index}`,
      top: () => ({ x: index * 20, y: 8, z: 0 }),
      look: { icon: 'run', board: SIGN_BOARD.working }
    }))
    const crowns = createLeaderCrownsLayer(theme.palette)
    const leaders = ['a', 'b', 'c'].map((id, index) =>
      makeAgent({ agentKey: `claude:${id}`, x: index * 6 })
    )
    const rig = createConstructionRigLayer(theme)
    const floors = [makeFloor({ floorId: 'g', buildingId: HOME })]
    const hoists = [0, 1, 2, 3].map((index) => ({
      id: `hoist:${index}`,
      kind: 'hoist' as const,
      buildingId: HOME,
      sessionKey: 'claude:a',
      atMs: 0
    }))
    for (const level of QUALITY_LEVELS) {
      signs.update({ hosts, camera: view, nowMs: 1_000, isPinned: false, isCameraMoved: true })
      crowns.update({
        crowned: leaders.map((agent) => agent.agentKey),
        agents: new Map(leaders.map((agent) => [agent.agentKey, agent])),
        buildingOf: () => null,
        places,
        poses: createPoseStore(),
        camera: view,
        nowMs: 1_000,
        isPinned: false
      })
      rig.update({
        events: hoists,
        floorsOf: () => floors,
        places,
        nowMs: 1_500,
        isPinned: false,
        level
      })
      expect(measureLayer(signs.group).draws).toBeLessThanOrEqual(
        CITY_LAYER_BUDGET.signs.draws[level]
      )
      expect(measureLayer(crowns.group).draws).toBeLessThanOrEqual(
        CITY_LAYER_BUDGET.crowns.draws[level]
      )
      expect(measureLayer(rig.group).draws).toBeLessThanOrEqual(CITY_LAYER_BUDGET.rig.draws[level])
      // A still frame: nothing the steady layers draw moved.
      signs.update({ hosts, camera: view, nowMs: 1_000, isPinned: false, isCameraMoved: true })
      expect(measureLayer(signs.group).uploadBytes).toBe(CITY_LAYER_BUDGET.signs.uploadBytes)
      expect(measureLayer(crowns.group).uploadBytes).toBe(CITY_LAYER_BUDGET.crowns.uploadBytes)
    }
  })
})
