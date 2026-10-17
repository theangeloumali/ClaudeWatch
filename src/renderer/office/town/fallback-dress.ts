import { Color } from 'three'
import { luminance } from '../themes/contrast'
import type { ThemePalette } from '../themes/types'
import { fallbackDesigns, fallbackProps } from './fallback-designs'
import type { TownDress } from './town-dress'
import { TOWN_DISTRICTS } from './town-zones'

const WHITE = new Color(1, 1, 1)
const hexOf = (color: Color): string => `#${color.getHexString()}`
// No palette has a green of its own, and a park must not read as one more paved block.
const LEAF = hexOf(new Color().setHSL(0.31, 0.38, 0.36))
// A road is this share of the darkest pad's light; a walk this many times the lightest pad's.
const ROAD_CONTRAST = 0.55
const WALK_CONTRAST = 1.35
const TOWARD_WHITE_STEP = 0.35
const MAX_LIGHTENING_STEPS = 8

const mix = (from: string, to: string, share: number): string =>
  hexOf(new Color(from).lerp(new Color(to), share))

// The colour itself when it is already under the limit, else the same hue brought under it.
function darkerThan(hex: string, limit: number): string {
  const light = luminance(hex)
  return light < limit ? hex : hexOf(new Color(hex).multiplyScalar((limit / light) * 0.9))
}

function lighterThan(hex: string, limit: number): string {
  let lightened = hex
  // A step at a time: a dark paper needs more than one.
  for (let step = 0; step < MAX_LIGHTENING_STEPS && luminance(lightened) <= limit; step++)
    lightened = hexOf(new Color(lightened).lerp(WHITE, TOWARD_WHITE_STEP))
  return lightened
}

function looksOf(palette: ThemePalette): TownDress['looks'] {
  return {
    civic: { accent: palette.gold, ground: mix(palette.paper, palette.stone, 0.45) },
    market: { accent: palette.lacquer, ground: mix(palette.gold, palette.paper, 0.5) },
    entertainment: {
      accent: mix(palette.blossom, palette.glow, 0.35),
      ground: mix(palette.blossom, palette.stone, 0.4)
    },
    residential: {
      accent: mix(palette.copper, palette.ink, 0.25),
      ground: mix(palette.floor, palette.paper, 0.35)
    },
    workshop: { accent: palette.brass, ground: mix(palette.stone, palette.ink, 0.3) },
    park: { accent: mix(LEAF, palette.copper, 0.25), ground: mix(LEAF, palette.floor, 0.4) }
  }
}

function roadsOf(palette: ThemePalette, looks: TownDress['looks']): TownDress['roads'] {
  const pads = TOWN_DISTRICTS.map((zone) => luminance(looks[zone].ground))
  return {
    carriageway: darkerThan(palette.ink, Math.min(...pads) * ROAD_CONTRAST),
    sidewalk: mix(palette.stone, palette.paper, 0.3),
    promenade: lighterThan(palette.paper, Math.max(...pads) * WALK_CONTRAST)
  }
}

const dressed = new WeakMap<ThemePalette, TownDress>()

// A whole town from a palette alone, in unit shapes: what a theme wears until it draws its own.
// The same palette hands back the same dress, so a view keyed on it is not rebuilt.
export function fallbackDress(palette: ThemePalette): TownDress {
  const known = dressed.get(palette)
  if (known) return known
  const looks = looksOf(palette)
  const dress: TownDress = {
    designs: fallbackDesigns(palette),
    props: fallbackProps(palette, LEAF),
    looks,
    roads: roadsOf(palette, looks),
    citizens: [],
    vehicles: []
  }
  dressed.set(palette, dress)
  return dress
}
