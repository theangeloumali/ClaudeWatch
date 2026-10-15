import { describe, expect, it } from 'vitest'
import { ISO_START_AZIMUTH } from '../../logic/camera-bands'
import { hudSafeInsets } from '../../logic/hud-layout'
import {
  boundsOfZone,
  frameBounds,
  HUD_SAFE_INSETS,
  cardSafeArea,
  projectToScreen
} from '../../logic/zone-framing'

describe('city framing with skyline height', () => {
  it('does not reserve desktop rails below the actual 768px CSS breakpoint', () => {
    expect(cardSafeArea({ width: 700, height: 600 }, hudSafeInsets(false))).toMatchObject({
      left: 0,
      right: 700
    })
    const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }
    const azimuth = ISO_START_AZIMUTH
    const viewport = { width: 700, height: 600 }
    const view = {
      ...frameBounds(bounds, viewport, { azimuth, insets: hudSafeInsets(false) }),
      azimuth
    }
    expect(projectToScreen({ x: 0, y: 1.3, z: 0 }, view, viewport).x).toBeCloseTo(350)
  })
  it('keeps framed geometry clear of measured 296px and 320px panel columns', () => {
    const viewport = { width: 900, height: 600 }
    const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }
    const azimuth = ISO_START_AZIMUTH
    const view = { ...frameBounds(bounds, viewport, { azimuth }), azimuth }
    for (const x of [-10, 10])
      for (const z of [-10, 10]) {
        const screen = projectToScreen({ x, y: 0, z }, view, viewport)
        expect(screen.x).toBeGreaterThanOrEqual(320 - 0.01)
        expect(screen.x).toBeLessThanOrEqual(556 + 0.01)
      }
  })
  it.each([0, 1, 2, 3])(
    'fits a translated large city and its skyline at rotation %i',
    (rotation) => {
      const viewport = { width: 900, height: 600 }
      const bounds = boundsOfZone({ x: 40, z: -30, width: 220, depth: 180 })
      const azimuth = ISO_START_AZIMUTH + (rotation * Math.PI) / 2
      const view = {
        ...frameBounds(bounds, viewport, { azimuth, minZoom: 0.1, maxZoom: 8, height: 24 }),
        azimuth
      }
      expect(view.zoom).toBeLessThan(4)
      for (const x of [bounds.minX, bounds.maxX]) {
        for (const z of [bounds.minZ, bounds.maxZ]) {
          for (const y of [0, 24]) {
            const screen = projectToScreen({ x, y, z }, view, viewport)
            expect(screen.x).toBeGreaterThanOrEqual(HUD_SAFE_INSETS.left - 0.01)
            expect(screen.x).toBeLessThanOrEqual(viewport.width - HUD_SAFE_INSETS.right + 0.01)
            expect(screen.y).toBeGreaterThanOrEqual(HUD_SAFE_INSETS.top - 0.01)
            expect(screen.y).toBeLessThanOrEqual(viewport.height - HUD_SAFE_INSETS.bottom + 0.01)
          }
        }
      }
    }
  )
})
