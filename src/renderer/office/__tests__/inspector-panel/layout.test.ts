import { describe, expect, it } from 'vitest'
import {
  clampInspectorWidth,
  DEFAULT_INSPECTOR_WIDTH,
  hudSafeInsets,
  inspectorWidthBounds,
  type InspectorLayout
} from '../../logic/hud-layout'

const DESKTOP_LAYOUT: InspectorLayout = {
  width: 520,
  viewportWidth: 1280,
  viewportHeight: 900,
  topInset: 40,
  isExpanded: false
}

describe('shared inspector layout', () => {
  it('keeps the default width and clamps every viewport to a valid finite range', () => {
    expect(DEFAULT_INSPECTOR_WIDTH).toBe(320)
    for (const viewportWidth of [390, 768, 900, 1280, 1440]) {
      const bounds = inspectorWidthBounds(viewportWidth)
      expect(bounds.min).toBeGreaterThan(0)
      expect(bounds.max).toBeGreaterThanOrEqual(bounds.min)
      expect(bounds.max).toBeLessThanOrEqual(viewportWidth - 24)
      expect(clampInspectorWidth(0, viewportWidth)).toBe(bounds.min)
      expect(clampInspectorWidth(9999, viewportWidth)).toBe(bounds.max)
    }
  })

  it('reserves the actual docked width and native title strip for camera and cards', () => {
    expect(hudSafeInsets(true, DESKTOP_LAYOUT)).toMatchObject({ right: 544, top: 112 })
    expect(hudSafeInsets(true, { ...DESKTOP_LAYOUT, width: 320 }).right).toBe(344)
    expect(hudSafeInsets(false, DESKTOP_LAYOUT).right).toBe(12)
  })

  it('reserves a bounded bottom sheet instead of a desktop right rail on narrow windows', () => {
    const narrow = { ...DESKTOP_LAYOUT, viewportWidth: 390, viewportHeight: 700 }
    const occupied = hudSafeInsets(true, narrow)
    const empty = hudSafeInsets(false, narrow)
    expect(occupied).toMatchObject({ left: 12, right: 12 })
    expect(occupied.bottom).toBeGreaterThan(empty.bottom)
    expect(occupied.top + occupied.bottom).toBeLessThan(narrow.viewportHeight)
  })
})
