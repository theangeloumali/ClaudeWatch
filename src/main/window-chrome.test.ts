import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  CHROME_COLORS,
  OFFICE_TITLE_BAR_HEIGHT,
  TITLE_BAR_HEIGHT,
  dashboardChrome,
  officeChrome,
  popoverChrome,
  windowChrome
} from './window-chrome'

describe('windowChrome', () => {
  it('keeps the inset traffic lights on macOS', () => {
    expect(windowChrome('darwin')).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 15, y: 15 }
    })
  })

  it('draws native caption buttons over the header rail on Windows, on an opaque window', () => {
    const chrome = windowChrome('win32')
    expect(chrome).toEqual({
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: CHROME_COLORS.rail,
        symbolColor: CHROME_COLORS.caption,
        height: TITLE_BAR_HEIGHT
      },
      backgroundColor: CHROME_COLORS.night
    })
    // A frameless or transparent window loses the caption buttons and its resize border on Windows.
    expect(chrome).not.toHaveProperty('frame')
    expect(chrome).not.toHaveProperty('transparent')
    expect(chrome).not.toHaveProperty('trafficLightPosition')
  })

  it('leaves the system frame alone elsewhere', () => {
    expect(windowChrome('linux')).toEqual({})
  })

  it('matches the header, which is 44 px tall (h-11)', () => {
    expect(TITLE_BAR_HEIGHT).toBe(44)
  })
})

describe('dashboardChrome', () => {
  it('stays frameless and translucent on macOS', () => {
    expect(dashboardChrome('darwin')).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 15, y: 15 },
      frame: false,
      transparent: true,
      vibrancy: 'under-window',
      visualEffectState: 'active'
    })
  })

  it('is the plain window chrome on Windows', () => {
    expect(dashboardChrome('win32')).toEqual(windowChrome('win32'))
  })
})

describe('popoverChrome', () => {
  it('keeps the popover vibrancy on macOS', () => {
    expect(popoverChrome('darwin')).toEqual({
      transparent: true,
      vibrancy: 'popover',
      visualEffectState: 'active'
    })
  })

  it('is opaque on Windows, where vibrancy does nothing and transparency drops the rounded corners', () => {
    expect(popoverChrome('win32')).toEqual({ backgroundColor: CHROME_COLORS.night })
  })
})

describe('officeChrome', () => {
  it('keeps the inset traffic lights on macOS, on the Office ground', () => {
    expect(officeChrome('darwin')).toEqual({
      ...windowChrome('darwin'),
      backgroundColor: CHROME_COLORS.office
    })
  })

  it('draws the caption buttons in the Office strip on Windows, so panels below it stay clear', () => {
    expect(officeChrome('win32')).toEqual({
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: CHROME_COLORS.office,
        symbolColor: CHROME_COLORS.caption,
        height: OFFICE_TITLE_BAR_HEIGHT
      },
      backgroundColor: CHROME_COLORS.office
    })
    // OfficeApp's drag strip is h-9 and its panels start at pt-10.
    expect(OFFICE_TITLE_BAR_HEIGHT).toBe(36)
  })

  it('leaves the system frame alone elsewhere', () => {
    expect(officeChrome('linux')).toEqual({ backgroundColor: CHROME_COLORS.office })
  })
})

describe('CHROME_COLORS', () => {
  // The main process cannot import the Tailwind config, so this pins the copies to it.
  const tailwind = readFileSync(join(__dirname, '../../tailwind.config.ts'), 'utf8')

  it('uses the palette the renderer paints with', () => {
    expect(tailwind).toContain(`rail: '${CHROME_COLORS.rail}'`)
    expect(tailwind).toContain(`NIGHT = '${CHROME_COLORS.night}'`)
    expect(tailwind).toContain(`WASHI = '${CHROME_COLORS.caption}'`)
  })
})
