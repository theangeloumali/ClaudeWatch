import { afterEach, describe, expect, it } from 'vitest'
import type { SessionRef } from '../../../../shared/office/types'
import { createCityEventLog } from '../../../office-live/city-events'
import { buildingIdOf } from '../../logic/city-signals'
import { CITY_LAYER_BUDGET, measureLayer } from '../../themes/city-layer-budget.test-utils'
import { listThemes } from '../../themes/registry'
import { markCeiling } from '../city-marks'
import { BURST_SPARKS } from '../city-particle-motion'
import { createParticleLayer, type ParticleLayer } from '../CityParticles'
import {
  cityEvent,
  HOME,
  layerScene,
  live,
  markFrame,
  NOW,
  placed,
  ROOF,
  usage,
  type Placed
} from './city-marks.test-utils'

const AWAY = buildingIdOf('c_test', 'p_2')
const ROOFS = new Map([
  [HOME, ROOF],
  [AWAY, { x: -20, y: 6, z: 4 }]
])
// Every shell of a burst has risen and is blooming by now.
const BLOOMING_MS = 1_000
const layers: ParticleLayer[] = []
const particles = (): ParticleLayer => {
  const layer = createParticleLayer(listThemes()[0].palette)
  layers.push(layer)
  return layer
}
afterEach(() => layers.splice(0).forEach((layer) => layer.dispose()))

const near = (x: number, z: number, radius: number) => (part: Placed) =>
  Math.hypot(part.position.x - x, part.position.z - z) <= radius
const tokensOf = (tokens: number): SessionRef => live('claude:a', { usage: usage(tokens) })

describe('error and rate-limit smoke', () => {
  it('an error or limited office puffs smoke', () => {
    for (const attention of ['error', 'limited'] as const) {
      const layer = particles()
      const sessions = [live('claude:a', { attention })]
      layer.draw(markFrame({ sessions, nowMs: NOW }))
      // A puff a beat: the column builds up from the first one, not all at once.
      const first = placed(layer.mesh).length
      layer.draw(markFrame({ sessions, nowMs: NOW + 3_000 }))
      const puffs = placed(layer.mesh)
      expect(first).toBeGreaterThan(0)
      expect(puffs.length).toBeGreaterThan(first)
      expect(puffs.every(near(ROOF.x, ROOF.z, 2))).toBe(true)
      for (const puff of puffs) {
        expect(puff.position.y).toBeGreaterThanOrEqual(ROOF.y)
        expect(puff.position.y).toBeLessThanOrEqual(markCeiling(ROOF))
      }
    }
  })

  it('smoke stops on the frame after the error clears, and a stale error shows none', () => {
    const layer = particles()
    layer.draw(markFrame({ sessions: [live('claude:a', { attention: 'error' })] }))
    layer.draw(markFrame({ sessions: [live('claude:a')], nowMs: NOW + 50 }))
    expect(placed(layer.mesh)).toEqual([])
  })

  it('particles share 1 draw', () => {
    const layer = particles()
    const sessions = [
      live('claude:a', { attention: 'error' }),
      live('claude:b', { projectKey: 'p_2', attention: 'limited' })
    ]
    const events = [
      cityEvent({ kind: 'milestone' }),
      cityEvent({ kind: 'hoist', buildingId: AWAY })
    ]
    layer.draw(markFrame({ sessions, events, roofs: ROOFS, nowMs: NOW + BLOOMING_MS }))
    const drawn = measureLayer(layerScene(layer.mesh))
    expect(drawn.draws).toBe(CITY_LAYER_BUDGET.particles.draws.full)
    expect(drawn.triangles).toBeLessThan(5_000)
  })

  it('no live event or trouble: nothing drawn and nothing uploaded over 30 frames', () => {
    const layer = particles()
    const scene = layerScene(layer.mesh)
    layer.draw(markFrame({ sessions: [live('claude:a')] }))
    measureLayer(scene)
    for (let frame = 1; frame <= 30; frame++) {
      layer.draw(markFrame({ sessions: [live('claude:a')], nowMs: NOW + frame * 50 }))
      expect(measureLayer(scene).uploadBytes).toBe(CITY_LAYER_BUDGET.particles.uploadBytes)
    }
    expect(placed(layer.mesh)).toEqual([])
  })
})

describe('milestone fireworks', () => {
  it('a session crossing 1M, 2M or 5M fires one burst from its building', () => {
    for (const step of [1e6, 2e6, 5e6]) {
      const log = createCityEventLog()
      log.observe('hello', [tokensOf(step - 1)], NOW)
      log.observe('patch', [tokensOf(step)], NOW)
      const frame = markFrame({ sessions: [tokensOf(step)], events: log.active(NOW) })
      expect(frame.events.map((event) => event.kind)).toEqual(['milestone'])
      const layer = particles()
      layer.draw(frame)
      const shells = placed(layer.mesh)
      expect(shells).toHaveLength(1)
      expect(shells[0].position.x).toBeCloseTo(ROOF.x)
      expect(shells[0].position.z).toBeCloseTo(ROOF.z)
      expect(shells[0].position.y).toBeCloseTo(ROOF.y)
      layer.draw({ ...frame, nowMs: NOW + BLOOMING_MS })
      expect(placed(layer.mesh)).toHaveLength(BURST_SPARKS)
      expect(placed(layer.mesh).every(near(ROOF.x, ROOF.z, 10))).toBe(true)
    }
  })

  it('a hello after the crossing fires nothing', () => {
    const log = createCityEventLog()
    log.observe('hello', [tokensOf(900_000)], NOW - 10_000)
    log.observe('patch', [tokensOf(1_100_000)], NOW - 10_000)
    log.observe('hello', [tokensOf(1_100_000)], NOW)
    const layer = particles()
    layer.draw(markFrame({ sessions: [tokensOf(1_100_000)], events: log.active(NOW) }))
    expect(placed(layer.mesh)).toEqual([])
  })

  it('bursts reuse the particle mesh', () => {
    const layer = particles()
    const { mesh } = layer
    const { geometry } = mesh
    const sessions = [live('claude:a', { attention: 'error' })]
    layer.draw(markFrame({ sessions }))
    const smoke = placed(mesh).length
    const events = [cityEvent({ kind: 'milestone' })]
    layer.draw(markFrame({ sessions, events, nowMs: NOW + BLOOMING_MS }))
    expect(layer.mesh).toBe(mesh)
    expect(mesh.geometry).toBe(geometry)
    expect(placed(mesh).length).toBeGreaterThanOrEqual(smoke + BURST_SPARKS)
    expect(measureLayer(layerScene(mesh)).draws).toBe(1)
  })

  it('four milestones at once draw at most three bursts', () => {
    const layer = particles()
    const events = [1, 2, 3, 4].map((index) =>
      cityEvent({ kind: 'milestone', id: `claude:${index}:milestone:1` })
    )
    layer.draw(markFrame({ sessions: [], events, nowMs: NOW + BLOOMING_MS }))
    expect(placed(layer.mesh)).toHaveLength(3 * BURST_SPARKS)
  })

  it('reduced motion draws a frozen bloom', () => {
    const layer = particles()
    const events = [cityEvent({ kind: 'milestone' })]
    const scene = layerScene(layer.mesh)
    layer.draw(markFrame({ sessions: [], events, isPinned: true }))
    expect(placed(layer.mesh)).toHaveLength(BURST_SPARKS)
    measureLayer(scene)
    layer.draw(markFrame({ sessions: [], events, isPinned: true, nowMs: NOW + 400 }))
    expect(measureLayer(scene).uploadBytes).toBe(0)
  })

  it('the desk band shows no fireworks or smoke', () => {
    const layer = particles()
    const sessions = [live('claude:a', { attention: 'error' })]
    const events = [cityEvent({ kind: 'milestone' })]
    layer.draw(markFrame({ sessions, events, band: 'desk', nowMs: NOW + BLOOMING_MS }))
    expect(placed(layer.mesh)).toEqual([])
  })
})

describe('hoist modules', () => {
  it('a hoist sets one module down onto the roof, and reduced motion skips it', () => {
    const layer = particles()
    const events = [cityEvent({ kind: 'hoist' })]
    layer.draw(markFrame({ sessions: [], events }))
    const [lifted] = placed(layer.mesh)
    layer.draw(markFrame({ sessions: [], events, nowMs: NOW + 2_900 }))
    const [landed] = placed(layer.mesh)
    expect(lifted.position.y).toBeGreaterThan(landed.position.y)
    // It sits on the roof: its centre is above the roof by less than its own height.
    expect(landed.position.y).toBeGreaterThan(ROOF.y)
    expect(landed.position.y - ROOF.y).toBeLessThan(1)
    expect(landed.position.x).toBeCloseTo(ROOF.x)
    layer.draw(markFrame({ sessions: [], events, isPinned: true }))
    expect(placed(layer.mesh)).toEqual([])
  })
})
