import type { OfficeTheme, ThemePalette } from '../types'

// dry-new: slate infrastructure and mineral courts are distinct from Edo's timber palette.
export const SAMURAI_MATERIALS = {
  charcoal: '#242D38',
  slate: '#465568',
  mineral: '#D6DCD5',
  indigo: '#343B69',
  cyan: '#62CEDA',
  magenta: '#CF789E',
  amber: '#E6B870',
  canal: '#326A79',
  metal: '#91A9AF',
  moss: '#617D70',
  garment: '#666C82'
}

export const SAMURAI_PALETTE: ThemePalette = {
  lacquer: SAMURAI_MATERIALS.indigo,
  ink: SAMURAI_MATERIALS.charcoal,
  gold: SAMURAI_MATERIALS.amber,
  brass: SAMURAI_MATERIALS.metal,
  copper: SAMURAI_MATERIALS.magenta,
  paper: SAMURAI_MATERIALS.mineral,
  wood: SAMURAI_MATERIALS.slate,
  floor: '#87948F',
  stone: SAMURAI_MATERIALS.slate,
  blossom: SAMURAI_MATERIALS.moss,
  glow: SAMURAI_MATERIALS.cyan,
  steam: SAMURAI_MATERIALS.mineral
}

export const SAMURAI_SKINS: OfficeTheme['robot']['skins'] = {
  claude: {
    label: 'Neon Crescent',
    body: SAMURAI_MATERIALS.indigo,
    trim: SAMURAI_MATERIALS.cyan,
    eye: SAMURAI_MATERIALS.cyan
  },
  codex: {
    label: 'Canal Circuit',
    body: SAMURAI_MATERIALS.slate,
    trim: SAMURAI_MATERIALS.magenta,
    eye: SAMURAI_MATERIALS.magenta
  },
  opencode: {
    label: 'Amber Heron',
    body: SAMURAI_MATERIALS.charcoal,
    trim: SAMURAI_MATERIALS.amber,
    eye: SAMURAI_MATERIALS.amber
  }
}
