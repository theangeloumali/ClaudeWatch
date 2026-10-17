import { Color } from 'three'
import type { ToolCategory } from '../../../shared/office/types'
import type { WorldVenue } from '../../../shared/office/world-document'
import { SCENE_BACKGROUND, STATE_COLOR } from '../office-palette'
import type { BuildingId, BuildingSignal } from './city-signals'
import { citySignalStore, type CitySignalStore } from './city-signal-store'

const TOOL_ICONS = [
  'read',
  'edit',
  'run',
  'web',
  'agent',
  'other'
] as const satisfies readonly ToolCategory[]
const VENUE_ICONS = [
  'arcade',
  'lounge',
  'market',
  'garage',
  'transit'
] as const satisfies readonly WorldVenue['kind'][]

// One atlas cell each, in this order.
// New icons go last, so every existing cell keeps its place.
export const SIGN_ICONS = [
  'hand',
  'error',
  'unknown',
  ...TOOL_ICONS,
  ...VENUE_ICONS,
  'question'
] as const
export type SignIcon = (typeof SIGN_ICONS)[number]
export type SignTint = 'needs-you' | 'error' | 'working' | 'unknown'

export interface SignState {
  icon: SignIcon
  tint: SignTint
}

// State colours mean the same in every theme, as on the HUD's gems.
export const SIGN_BOARD: Record<SignTint, string> = {
  'needs-you': STATE_COLOR.permission,
  error: STATE_COLOR.error,
  working: STATE_COLOR.working,
  unknown: STATE_COLOR.limited
}

// Needs-you beats trouble, trouble beats work; idle or done is dark (null).
export function signFor(signal: BuildingSignal): SignState | null {
  if (!signal.hasEvidence) return { icon: 'unknown', tint: 'unknown' }
  if (signal.needsYou)
    return { icon: signal.asks === 'question' ? 'question' : 'hand', tint: 'needs-you' }
  if (signal.hasError || signal.isLimited) return { icon: 'error', tint: 'error' }
  if (signal.busiestCategory) return { icon: signal.busiestCategory, tint: 'working' }
  return null
}

export const venueSign = (kind: WorldVenue['kind']): { icon: SignIcon } => ({ icon: kind })

// WCAG relative luminance: three's Color holds the linear channels the formula needs.
function luminance(color: string): number {
  const { r, g, b } = new Color(color)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

const SIGN_INK = SCENE_BACKGROUND
const SIGN_PAPER = '#FFFFFF'
const ICON_CONTRAST = 3

// Ink by default (white fails four of the five state boards); white only where ink cannot read.
export const signInk = (board: string): string =>
  contrastRatio(SIGN_INK, board) >= ICON_CONTRAST ? SIGN_INK : SIGN_PAPER

export interface ProjectSigns {
  sign(buildingId: BuildingId): SignState | null
  all(): ReadonlyMap<BuildingId, SignState | null>
  // Bumps only when a sign's icon or tint changed.
  version(): number
}

export function createProjectSigns(
  signals: Pick<CitySignalStore, 'current' | 'version'>
): ProjectSigns {
  let readVersion: number | null = null
  let signs: ReadonlyMap<BuildingId, SignState | null> = new Map()
  let print = '[]'
  let version = 0
  const refresh = (): void => {
    if (signals.version() === readVersion) return
    readVersion = signals.version()
    const next = new Map(
      [...signals.current().buildings].map(([id, signal]) => [id, signFor(signal)])
    )
    const nextPrint = JSON.stringify([...next])
    if (nextPrint === print) return
    print = nextPrint
    signs = next
    version += 1
  }
  return {
    sign: (buildingId) => {
      refresh()
      return signs.get(buildingId) ?? null
    },
    all: () => {
      refresh()
      return signs
    },
    version: () => {
      refresh()
      return version
    }
  }
}

// The page's signs, read by CitySigns in its frame loop.
export const projectSigns = createProjectSigns(citySignalStore)
