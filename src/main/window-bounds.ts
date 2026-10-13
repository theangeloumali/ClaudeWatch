import { object } from '../bridge/io'
import { clamp } from '../shared/range'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

type Size = Pick<Bounds, 'width' | 'height'>

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

function isBounds(value: unknown): value is Bounds {
  const rect = object(value)
  if (!rect) return false
  const { x, y, width, height } = rect
  return (
    isFiniteNumber(x) &&
    isFiniteNumber(y) &&
    isFiniteNumber(width) &&
    isFiniteNumber(height) &&
    width > 0 &&
    height > 0
  )
}

export function isOnAnyDisplay(rect: Bounds, workAreas: readonly Bounds[]): boolean {
  return workAreas.some(
    (area) =>
      rect.x < area.x + area.width &&
      rect.x + rect.width > area.x &&
      rect.y < area.y + area.height &&
      rect.y + rect.height > area.y
  )
}

// Reuses saved bounds only on a display that is still connected, and keeps the whole window,
// at no less than its minimum size, inside that display's work area.
export function restoreBounds(
  saved: unknown,
  workAreas: readonly Bounds[],
  fallback: Size,
  minimum: Size = { width: 0, height: 0 }
): Bounds | Size {
  if (!isBounds(saved)) return fallback
  // The display under the window's centre is its home. A window that mostly sat on a display
  // that is gone opens at the default instead of being squeezed onto what is left.
  const centre = { x: saved.x + saved.width / 2, y: saved.y + saved.height / 2 }
  const home = workAreas.find(
    (area) =>
      centre.x >= area.x &&
      centre.x < area.x + area.width &&
      centre.y >= area.y &&
      centre.y < area.y + area.height
  )
  if (!home) return fallback
  const width = Math.round(clamp(saved.width, [minimum.width, home.width]))
  const height = Math.round(clamp(saved.height, [minimum.height, home.height]))
  return {
    x: Math.round(clamp(saved.x, [home.x, home.x + home.width - width])),
    y: Math.round(clamp(saved.y, [home.y, home.y + home.height - height])),
    width,
    height
  }
}

const POPOVER_GAP = 4

// Opens away from whichever work-area edge the taskbar or menu bar holding the icon sits on.
// An icon inside the work area (an overflow flyout, an auto-hidden taskbar) opens on the roomier side.
export function popoverPosition(
  tray: Bounds,
  workArea: Bounds,
  size: Size
): { x: number; y: number } {
  const centre = { x: tray.x + tray.width / 2, y: tray.y + tray.height / 2 }
  const right = workArea.x + workArea.width
  const bottom = workArea.y + workArea.height
  const centredX = centre.x - size.width / 2
  const levelY = centre.y - size.height / 2
  const above = { x: centredX, y: tray.y - size.height - POPOVER_GAP }
  const below = { x: centredX, y: tray.y + tray.height + POPOVER_GAP }

  let position: { x: number; y: number }
  if (centre.y >= bottom) position = above
  else if (centre.y < workArea.y) position = below
  else if (centre.x < workArea.x) position = { x: tray.x + tray.width + POPOVER_GAP, y: levelY }
  else if (centre.x >= right) position = { x: tray.x - size.width - POPOVER_GAP, y: levelY }
  else position = centre.y > workArea.y + workArea.height / 2 ? above : below

  return {
    x: Math.round(clamp(position.x, [workArea.x, right - size.width])),
    y: Math.round(clamp(position.y, [workArea.y, bottom - size.height]))
  }
}

interface MovableWindow {
  on(event: 'moved' | 'resized' | 'close', listener: () => void): unknown
  getNormalBounds(): Bounds
  isDestroyed(): boolean
}

const SAVE_DELAY_MS = 300

// Saves only what the user did. A window that opened at the default because its display was
// unplugged, and was never moved, must not overwrite the place it is remembered at.
export function rememberBounds(window: MovableWindow, save: (bounds: Bounds) => void): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = (): void => {
    if (!timer) return
    clearTimeout(timer)
    timer = null
    // Normal bounds, so a maximised or full-screen window still reopens at its own size.
    if (!window.isDestroyed()) save(window.getNormalBounds())
  }
  const touched = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, SAVE_DELAY_MS)
  }
  window.on('moved', touched)
  window.on('resized', touched)
  window.on('close', flush)
}
