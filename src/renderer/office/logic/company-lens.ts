import { useSyncExternalStore } from 'react'
import { Color, SRGBColorSpace } from 'three'
import { agentHash } from '../themes/roster'
import type { ThemePalette } from '../themes/types'
import { compareKeys } from './city-signals'
import { createSubscribers } from './subscribers'

// Whether every office of a company wears that company's hue. For this page's life only.
export interface CompanyLensStore {
  isOn(): boolean
  toggle(): void
  subscribe(listener: () => void): () => void
}

export function createCompanyLensStore(): CompanyLensStore {
  const { subscribe, notify } = createSubscribers()
  let isOn = false
  return {
    isOn: () => isOn,
    toggle: () => {
      isOn = !isOn
      notify()
    },
    subscribe
  }
}

export const companyLens = createCompanyLensStore()

export function useCompanyLens(): boolean {
  return useSyncExternalStore(companyLens.subscribe, companyLens.isOn)
}

const PALETTE_ORDER: readonly (keyof ThemePalette)[] = [
  'lacquer',
  'gold',
  'copper',
  'blossom',
  'glow',
  'brass',
  'wood',
  'floor',
  'stone',
  'paper',
  'ink',
  'steam'
]

// Closer than this in sRGB (0–255 a channel), two tinted offices read as one colour.
const MIN_HUE_APART = 48

const channelsOf = (hex: string): number[] => {
  const value = Number.parseInt(hex.slice(1), 16)
  return [value >> 16, (value >> 8) & 0xff, value & 0xff]
}

const hsl = { h: 0, s: 0, l: 0 }

// sRGB saturation and lightness: a grey, dark or washed-out colour tints an office into the grey
// filler around it.
function isChromatic(hex: string): boolean {
  const { s, l } = new Color(hex).getHSL(hsl, SRGBColorSpace)
  return s >= 0.3 && l >= 0.3 && l <= 0.88
}

// The theme's colours that read as a hue, each clear of the others; `glow` stands in for a theme
// with none.
export function lensHues(palette: ThemePalette): string[] {
  const kept: { hex: string; channels: number[] }[] = []
  for (const key of PALETTE_ORDER) {
    const hex = palette[key].toUpperCase()
    const channels = channelsOf(hex)
    const isClear = kept.every(
      (hue) => Math.hypot(...hue.channels.map((value, at) => value - channels[at])) >= MIN_HUE_APART
    )
    if (isChromatic(hex) && isClear) kept.push({ hex, channels })
  }
  return kept.length > 0 ? kept.map((hue) => hue.hex) : [palette.glow.toUpperCase()]
}

// A seeded pick per company. One already held on screen gives way to the next least-used hue,
// so companies share a hue only once the palette has none left.
export function companyHues(
  companyKeys: Iterable<string>,
  palette: ThemePalette
): ReadonlyMap<string, string> {
  const hues = lensHues(palette)
  const uses = hues.map(() => 0)
  const picked = new Map<string, string>()
  for (const key of [...new Set(companyKeys)].sort(compareKeys)) {
    const fewest = Math.min(...uses)
    let slot = agentHash(`company-lens/${key}`) % hues.length
    while (uses[slot] > fewest) slot = (slot + 1) % hues.length
    uses[slot] += 1
    picked.set(key, hues[slot])
  }
  return picked
}
