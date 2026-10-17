import { afterEach, describe, expect, it } from 'vitest'
import { buildingIdOf } from '../../logic/city-signals'
import { CITY_LAYER_BUDGET, measureLayer } from '../../themes/city-layer-budget.test-utils'
import { listThemes } from '../../themes/registry'
import { GROUND_LAYERS, groundLayerY } from '../../town/town-ground'
import { makeFloor } from '../../__tests__/fixtures'
import { beaconFootprints, createBeaconLayer, type BeaconLayer } from '../CityBeacons'
import { HOME, layerScene, live, markFrame, placed, ROOF, stale } from './city-marks.test-utils'

const AWAY = buildingIdOf('c_test', 'p_2')
const FOOTPRINTS = new Map([
  [HOME, 10],
  [AWAY, 8]
])
const layers: BeaconLayer[] = []
const beacons = (): BeaconLayer => {
  const layer = createBeaconLayer(listThemes()[0].palette)
  layers.push(layer)
  return layer
}
afterEach(() => layers.splice(0).forEach((layer) => layer.dispose()))

describe('needs-you beacons', () => {
  it('a permission or question prompt raises a beacon over its building', () => {
    for (const attention of ['permission', 'question'] as const) {
      const layer = beacons()
      layer.draw(markFrame({ sessions: [live('claude:a', { attention })] }), FOOTPRINTS)
      const [column] = placed(layer.mesh)
      expect(column.position.x).toBeCloseTo(ROOF.x)
      expect(column.position.z).toBeCloseTo(ROOF.z)
      // The column starts at the roof, so it never runs through a cut-away office.
      expect(column.position.y).toBeCloseTo(ROOF.y)
    }
  })

  it('it drops when answered', () => {
    const layer = beacons()
    layer.draw(markFrame({ sessions: [live('claude:a', { attention: 'permission' })] }), FOOTPRINTS)
    expect(placed(layer.mesh).length).toBeGreaterThan(0)
    layer.draw(markFrame({ sessions: [live('claude:a', { attention: 'none' })] }), FOOTPRINTS)
    expect(placed(layer.mesh)).toEqual([])
  })

  it('a stale session lights no beacon', () => {
    const layer = beacons()
    layer.draw(
      markFrame({ sessions: [stale('claude:a', { attention: 'permission' })] }),
      FOOTPRINTS
    )
    expect(placed(layer.mesh)).toEqual([])
  })

  it('beacons cost 1 draw', () => {
    const layer = beacons()
    const roofs = new Map([
      [HOME, ROOF],
      [AWAY, { x: -20, y: 6, z: 4 }]
    ])
    const sessions = [
      live('claude:a', { attention: 'permission' }),
      live('claude:b', { projectKey: 'p_2', attention: 'question' })
    ]
    layer.draw(markFrame({ sessions, roofs }), FOOTPRINTS)
    const scene = layerScene(layer.mesh)
    const drawn = measureLayer(scene)
    expect(drawn.draws).toBe(CITY_LAYER_BUDGET.beacons.draws.full)
    expect(placed(layer.mesh)).toHaveLength(6)
    // Pinned by reduced motion, a still beacon sends nothing.
    layer.draw(markFrame({ sessions, roofs, isPinned: true }), FOOTPRINTS)
    measureLayer(scene)
    layer.draw(markFrame({ sessions, roofs, isPinned: true, nowMs: 5_000 }), FOOTPRINTS)
    expect(measureLayer(scene).uploadBytes).toBe(CITY_LAYER_BUDGET.beacons.uploadBytes)
  })

  it('the beacon ring takes its own ground layer slot', () => {
    const layer = beacons()
    layer.draw(markFrame({ sessions: [live('claude:a', { attention: 'permission' })] }), FOOTPRINTS)
    const [, ...rings] = placed(layer.mesh)
    expect(rings).toHaveLength(2)
    for (const ring of rings) {
      expect(ring.position.y).toBeCloseTo(groundLayerY('beacon'))
      // Round the building, never under it.
      expect(ring.scale.x).toBeGreaterThanOrEqual(FOOTPRINTS.get(HOME) ?? Infinity)
    }
    const others = GROUND_LAYERS.filter((slot) => slot !== 'beacon').map(groundLayerY)
    expect(groundLayerY('beacon')).toBeGreaterThan(Math.max(...others))
  })

  it('the floor band shows rings only, and the desk band no beacon', () => {
    const layer = beacons()
    const sessions = [live('claude:a', { attention: 'permission' })]
    layer.draw(markFrame({ sessions, band: 'floor' }), FOOTPRINTS)
    const parts = placed(layer.mesh)
    expect(parts).toHaveLength(2)
    for (const part of parts) expect(part.position.y).toBeCloseTo(groundLayerY('beacon'))
    layer.draw(markFrame({ sessions, band: 'desk' }), FOOTPRINTS)
    expect(placed(layer.mesh)).toEqual([])
  })

  it('the column keeps a readable width on screen at every building zoom', () => {
    const layer = beacons()
    const sessions = [live('claude:a', { attention: 'permission' })]
    for (const zoom of [3, 8, 15]) {
      layer.draw(markFrame({ sessions, zoom }), FOOTPRINTS)
      const widthPx = placed(layer.mesh)[0].scale.x * 2 * zoom
      expect(widthPx).toBeGreaterThanOrEqual(6)
      expect(widthPx).toBeLessThanOrEqual(16)
    }
  })

  it('a building with no roof yet draws nothing', () => {
    const layer = beacons()
    const sessions = [live('claude:a', { attention: 'permission' })]
    layer.draw(markFrame({ sessions, roofs: new Map() }), FOOTPRINTS)
    expect(placed(layer.mesh)).toEqual([])
  })

  it("rings go round the building's widest plate", () => {
    const floors = [
      makeFloor({ floorId: 'a', buildingId: HOME, width: 20, depth: 16 }),
      makeFloor({ floorId: 'b', buildingId: HOME, width: 12, depth: 30 }),
      makeFloor({ floorId: 'c' })
    ]
    const footprints = beaconFootprints(floors)
    expect(footprints.get(HOME)).toBeCloseTo(Math.hypot(20, 30) / 2)
    // A lone storey is its own building, keyed as its roof is.
    expect(footprints.get('c')).toBeCloseTo(Math.hypot(floors[2].width, floors[2].depth) / 2)
    expect(footprints.size).toBe(2)
  })
})
