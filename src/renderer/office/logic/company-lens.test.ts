import { Color, SRGBColorSpace } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { listThemes } from '../themes/registry'
import { companyHues, createCompanyLensStore, lensHues } from './company-lens'

// Real company keys are the folders holding projects: neighbours differ in a character or two.
const FOLDERS = [
  '/Users/angelo/Desktop/Work/ZKidz',
  '/Users/angelo/Desktop/Work/ZKidy',
  '/Users/angelo/Desktop/Work/ClearSpent',
  '/Users/angelo/Desktop/Work/PropApp',
  '/Users/angelo/Desktop/Work/client-1',
  '/Users/angelo/Desktop/Work/client-2',
  '/Users/angelo/Desktop/Work/client-3',
  '/Users/angelo/Desktop/Work/client-4'
]

describe('company lens hues', () => {
  it('neighbouring company keys get different hues within one theme', () => {
    for (const { id, palette } of listThemes()) {
      const room = lensHues(palette).length
      // orbital-garrison has two: its other colours are greys and navies.
      expect(room, id).toBeGreaterThanOrEqual(2)
      for (let start = 0; start + room <= FOLDERS.length; start++) {
        const keys = FOLDERS.slice(start, start + room)
        const hues = companyHues(keys, palette)
        expect(new Set(hues.values()).size, `${id} ${keys.join(' ')}`).toBe(keys.length)
      }
    }
  })

  // Live check, corporate-city: a dark slate turned the offices' white roofs into the grey filler.
  it('every hue stands out from the grey city: saturated, and neither dark nor washed out', () => {
    const hsl = { h: 0, s: 0, l: 0 }
    for (const { id, palette } of listThemes())
      for (const hue of lensHues(palette)) {
        new Color(hue).getHSL(hsl, SRGBColorSpace)
        expect(hsl.s, `${id} ${hue}`).toBeGreaterThanOrEqual(0.3)
        expect(hsl.l, `${id} ${hue}`).toBeGreaterThanOrEqual(0.3)
        expect(hsl.l, `${id} ${hue}`).toBeLessThanOrEqual(0.88)
      }
  })

  // Live check, corporate-city: gold and wood tinted two companies into one tan.
  it('no two hues of a theme are near twins', () => {
    const rgb = (hex: string): number[] => {
      const value = Number.parseInt(hex.slice(1), 16)
      return [value >> 16, (value >> 8) & 0xff, value & 0xff]
    }
    for (const { id, palette } of listThemes()) {
      const hues = lensHues(palette)
      for (const [index, hue] of hues.entries())
        for (const other of hues.slice(index + 1)) {
          const [a, b] = [rgb(hue), rgb(other)]
          const apart = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
          expect(apart, `${id} ${hue} ${other}`).toBeGreaterThanOrEqual(48)
        }
    }
  })

  it('every hue is a colour of the theme palette', () => {
    for (const { palette } of listThemes()) {
      const own = new Set(Object.values(palette).map((hex) => hex.toUpperCase()))
      for (const hue of companyHues(FOLDERS, palette).values()) expect(own.has(hue)).toBe(true)
    }
  })

  it('the pick is seeded: the same companies get the same hues in any order', () => {
    const { palette } = listThemes()[0]
    const forward = companyHues(FOLDERS, palette)
    const backward = companyHues([...FOLDERS].reverse(), palette)
    expect([...backward].sort()).toEqual([...forward].sort())
  })

  it('more companies than hues share them evenly', () => {
    for (const { palette } of listThemes()) {
      const room = lensHues(palette).length
      const keys = Array.from({ length: room * 3 }, (_unused, index) => `/Work/c${index}`)
      const uses = new Map<string, number>()
      for (const hue of companyHues(keys, palette).values()) uses.set(hue, (uses.get(hue) ?? 0) + 1)
      expect([...uses.values()]).toEqual(Array.from({ length: room }, () => 3))
    }
  })
})

describe('company lens store', () => {
  it('starts off, toggles, and tells its listeners', () => {
    const lens = createCompanyLensStore()
    const listener = vi.fn()
    const stop = lens.subscribe(listener)
    expect(lens.isOn()).toBe(false)
    lens.toggle()
    expect(lens.isOn()).toBe(true)
    lens.toggle()
    expect(lens.isOn()).toBe(false)
    expect(listener).toHaveBeenCalledTimes(2)
    stop()
    lens.toggle()
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
