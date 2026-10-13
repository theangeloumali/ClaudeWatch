import type { BrowserWindowConstructorOptions } from 'electron'

type Chrome = Partial<BrowserWindowConstructorOptions>

// Copies of tailwind.config.ts tokens (surface.rail, surface, text.primary); a test pins them.
export const CHROME_COLORS = {
  rail: '#171C36',
  night: '#121629',
  caption: '#EFE6D2',
  // The Office window's own ground, behind its 3D scene.
  office: '#0E0E10'
} as const

// The renderer's Header is h-11; the caption buttons fill the same strip.
export const TITLE_BAR_HEIGHT = 44
// OfficeApp's drag strip is h-9 and its panels start at pt-10, below these buttons.
export const OFFICE_TITLE_BAR_HEIGHT = 36

// Window Controls Overlay needs the system frame: frame:false or transparent drops the buttons.
function windowsOverlay(color: string, height: number): Chrome {
  return {
    titleBarStyle: 'hidden',
    titleBarOverlay: { color, symbolColor: CHROME_COLORS.caption, height }
  }
}

export function windowChrome(platform: NodeJS.Platform = process.platform): Chrome {
  if (platform === 'darwin') {
    return { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 15, y: 15 } }
  }
  if (platform === 'win32') {
    return {
      ...windowsOverlay(CHROME_COLORS.rail, TITLE_BAR_HEIGHT),
      backgroundColor: CHROME_COLORS.night
    }
  }
  return {}
}

export function dashboardChrome(platform: NodeJS.Platform = process.platform): Chrome {
  if (platform !== 'darwin') return windowChrome(platform)
  return {
    ...windowChrome(platform),
    frame: false,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active'
  }
}

// The popover is frameless everywhere; only macOS gets its translucent material.
export function popoverChrome(platform: NodeJS.Platform = process.platform): Chrome {
  if (platform === 'darwin') {
    return { transparent: true, vibrancy: 'popover', visualEffectState: 'active' }
  }
  return { backgroundColor: CHROME_COLORS.night }
}

export function officeChrome(platform: NodeJS.Platform = process.platform): Chrome {
  if (platform !== 'win32')
    return { ...windowChrome(platform), backgroundColor: CHROME_COLORS.office }
  return {
    ...windowsOverlay(CHROME_COLORS.office, OFFICE_TITLE_BAR_HEIGHT),
    backgroundColor: CHROME_COLORS.office
  }
}
