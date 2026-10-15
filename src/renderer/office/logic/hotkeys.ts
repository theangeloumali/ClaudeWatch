import { walkKey } from '../player/walking'
import type { ZoomDirection } from './camera-bands'
import type { WallsMode } from './room-layout'

export type OfficeCommand =
  | { type: 'walls'; mode: WallsMode }
  | { type: 'next-attention' }
  | { type: 'toggle-list' }
  | { type: 'cycle-theme' }
  | { type: 'focus-terminal' }
  | { type: 'company-number'; number: number }
  | { type: 'rotate'; direction: -1 | 1 }
  | { type: 'tilt'; direction: -1 | 1 }
  | { type: 'zoom'; direction: ZoomDirection }
  | { type: 'fly-to-selected' }
  | { type: 'toggle-walk' }
  | { type: 'toggle-settings' }

export interface KeyInput {
  key: string
  hasModifier: boolean
  isTargetEditable: boolean
  // A focused button or link owns Enter, so it must not also fly the camera.
  isTargetInteractive: boolean
  isCameraBlocked?: boolean
}

// The keycaps the HUD shows for walking: the switch, and speaking to the agent beside the player.
export const WALK_KEYS = { toggle: 'G', talk: 'X' }

// The keycap on the bar's Settings button.
export const SETTINGS_KEY = ','

const FIXED_COMMANDS: Record<string, OfficeCommand> = {
  home: { type: 'walls', mode: 'up' },
  w: { type: 'walls', mode: 'cutaway' },
  end: { type: 'walls', mode: 'down' },
  n: { type: 'next-attention' },
  l: { type: 'toggle-list' },
  t: { type: 'cycle-theme' },
  f: { type: 'focus-terminal' },
  g: { type: 'toggle-walk' },
  q: { type: 'rotate', direction: -1 },
  e: { type: 'rotate', direction: 1 },
  pageup: { type: 'tilt', direction: 1 },
  pagedown: { type: 'tilt', direction: -1 },
  '-': { type: 'zoom', direction: 'out' },
  '=': { type: 'zoom', direction: 'in' },
  '+': { type: 'zoom', direction: 'in' },
  [SETTINGS_KEY]: { type: 'toggle-settings' }
}

// While walking, W A S D move the player, so W stops being the cutaway key. With the player
// switched off in the settings there is nobody to walk, so its key does nothing.
export function commandForKey(
  input: KeyInput,
  isWalking = false,
  hasPlayer = true
): OfficeCommand | null {
  if (input.hasModifier || input.isTargetEditable) return null
  if (input.isCameraBlocked && /^(q|e|pageup|pagedown|-|=|\+|enter|[1-9])$/i.test(input.key))
    return null
  if (isWalking && walkKey(input.key)) return null
  if (input.key === 'Enter') return input.isTargetInteractive ? null : { type: 'fly-to-selected' }
  if (/^[1-9]$/.test(input.key)) return { type: 'company-number', number: Number(input.key) }
  const command = FIXED_COMMANDS[input.key.toLowerCase()] ?? null
  return command?.type === 'toggle-walk' && !hasPlayer ? null : command
}

export function keyInputFrom(event: KeyboardEvent): KeyInput {
  const target = event.target instanceof HTMLElement ? event.target : null
  return {
    key: event.key,
    hasModifier: event.metaKey || event.ctrlKey || event.altKey,
    isTargetEditable: Boolean(target?.closest('input, textarea, select, [contenteditable="true"]')),
    isTargetInteractive: Boolean(target?.closest('button, a[href], summary')),
    isCameraBlocked:
      Boolean(document.querySelector('[data-camera-guard]')) || isInsideScroller(event.target)
  }
}

export function inspectorOwnsKeyboard(event: Pick<Event, 'target'>): boolean {
  const target = event.target instanceof Element ? event.target : null
  return Boolean(
    document.querySelector(
      '[data-inspector-expanded="true"], [aria-modal="true"]:not([hidden]):not([aria-hidden="true"]), dialog[open]'
    ) || target?.closest('[data-inspector-resizer]')
  )
}

const SCROLLING_OVERFLOW = new Set(['auto', 'scroll'])

// Arrow keys scroll a HUD panel when focus is inside one that overflows; panning as well would
// take keyboard scrolling away from it.
export function isInsideScroller(target: EventTarget | null): boolean {
  let element = target instanceof Element ? target : null
  while (element && element !== document.body) {
    const { overflowX, overflowY } = getComputedStyle(element)
    const scrollsDown =
      SCROLLING_OVERFLOW.has(overflowY) && element.scrollHeight > element.clientHeight
    const scrollsAcross =
      SCROLLING_OVERFLOW.has(overflowX) && element.scrollWidth > element.clientWidth
    if (scrollsDown || scrollsAcross) return true
    element = element.parentElement
  }
  return false
}
