import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import type { SessionRef } from '../../../../shared/office/types'
import { createCityEventLog } from '../../../office-live/city-events'
import { buildingIdOf } from '../../logic/city-signals'
import { CITY_LAYER_BUDGET, measureLayer } from '../../themes/city-layer-budget.test-utils'
import { listThemes } from '../../themes/registry'
import { markCeiling } from '../city-marks'
import { createFlagLayer, type FlagLayer } from '../DoneFlags'
import { HOME, layerScene, live, markFrame, NOW, placed, ROOF } from './city-marks.test-utils'

const AWAY = buildingIdOf('c_test', 'p_2')
const layers: FlagLayer[] = []
const flags = (): FlagLayer => {
  const layer = createFlagLayer(listThemes()[0].palette)
  layers.push(layer)
  return layer
}
afterEach(() => layers.splice(0).forEach((layer) => layer.dispose()))

const done = (overrides: Partial<SessionRef> = {}): SessionRef =>
  live('claude:a', { attention: 'done', updatedAtMs: NOW, ...overrides })

function headingOf(layer: FlagLayer): number {
  const matrix = new Matrix4()
  layer.mesh.getMatrixAt(0, matrix)
  const turn = new Quaternion()
  matrix.decompose(new Vector3(), turn, new Vector3())
  return new Euler().setFromQuaternion(turn, 'YXZ').y
}

describe('done flags', () => {
  it('a turn done raises a flag for the 120 s done badge', () => {
    const log = createCityEventLog()
    log.observe('hello', [live('claude:a')], NOW)
    log.observe('patch', [done()], NOW)
    const events = log.active(NOW)
    expect(events.map((event) => event.kind)).toEqual(['done'])
    const layer = flags()
    const heightAt = (nowMs: number, sessions = [done()]): number => {
      layer.draw(markFrame({ sessions, events, nowMs }), 0)
      return placed(layer.mesh)[0]?.scale.y ?? 0
    }
    const rising = heightAt(NOW + 300)
    const raised = heightAt(NOW + 1_000)
    expect(rising).toBeGreaterThan(0)
    expect(rising).toBeLessThan(raised)
    // Flown for as long as the bridge keeps the badge, then lowered.
    expect(heightAt(NOW + 119_000)).toBeCloseTo(raised)
    expect(heightAt(NOW + 120_000, [live('claude:a')])).toBe(0)
    layer.draw(markFrame({ sessions: [done()], events }), 0)
    const [flag] = placed(layer.mesh)
    expect(flag.position.x).toBeCloseTo(ROOF.x)
    expect(flag.position.y).toBeCloseTo(ROOF.y)
    expect(flag.position.y + raised).toBeLessThanOrEqual(markCeiling(ROOF) + 1e-6)
  })

  it('a done carried in the first hello is drawn fully raised', () => {
    const layer = flags()
    layer.draw(markFrame({ sessions: [done()] }), 0)
    const first = placed(layer.mesh)[0].scale.y
    layer.draw(markFrame({ sessions: [done()], nowMs: NOW + 5_000 }), 0)
    expect(first).toBeCloseTo(placed(layer.mesh)[0].scale.y)
  })

  it('flags cost 1 draw', () => {
    const layer = flags()
    const roofs = new Map([
      [HOME, ROOF],
      [AWAY, { x: -20, y: 6, z: 4 }]
    ])
    const sessions = [done(), done({ key: 'claude:b', projectKey: 'p_2' })]
    layer.draw(markFrame({ sessions, roofs }), 0)
    const scene = layerScene(layer.mesh)
    expect(measureLayer(scene).draws).toBe(CITY_LAYER_BUDGET.flags.draws.full)
    expect(placed(layer.mesh)).toHaveLength(2)
    // Reduced motion stills the flutter, so a flown flag sends nothing.
    layer.draw(markFrame({ sessions, roofs, isPinned: true }), 0)
    measureLayer(scene)
    layer.draw(markFrame({ sessions, roofs, isPinned: true, nowMs: NOW + 700 }), 0)
    expect(measureLayer(scene).uploadBytes).toBe(CITY_LAYER_BUDGET.flags.uploadBytes)
  })

  it('the flag turns with the camera azimuth', () => {
    const layer = flags()
    for (const azimuth of [Math.PI / 4, (3 * Math.PI) / 4, -Math.PI / 4]) {
      layer.draw(markFrame({ sessions: [done()], isPinned: true }), azimuth)
      expect(headingOf(layer)).toBeCloseTo(azimuth)
    }
  })

  it('the desk band shows no flag, and a stale done flies none', () => {
    const layer = flags()
    layer.draw(markFrame({ sessions: [done()], band: 'desk' }), 0)
    expect(placed(layer.mesh)).toEqual([])
    const stale = live('claude:a', {
      attention: 'done',
      observation: { sourceId: 'claude', observedAtMs: 0, staleAfterMs: 1, coverage: 'own' }
    })
    layer.draw(markFrame({ sessions: [stale] }), 0)
    expect(placed(layer.mesh)).toEqual([])
  })
})
