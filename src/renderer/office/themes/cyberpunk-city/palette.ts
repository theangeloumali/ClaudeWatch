import type { OfficeTheme, ThemePalette } from '../types'

// dry-new: industrial city materials are separate from Corporate City and HUD status colors.
export const CYBERPUNK_MATERIALS = {
  asphalt: '#242D36',
  steel: '#52616E',
  // Steel also colors sidewalks; structural darkness belongs to these separate roles.
  graphite: '#1D2435',
  facade: '#28374B',
  equipment: '#3D4B5C',
  concrete: '#79848B',
  glass: '#385A72',
  cyan: '#49E6F2',
  amber: '#FFBE68',
  pink: '#F464BE',
  foliage: '#577768',
  skin: '#C99676',
  hair: '#302B35',
  light: '#DCE7E8'
} as const

export const CYBERPUNK_PALETTE: ThemePalette = {
  lacquer: CYBERPUNK_MATERIALS.facade,
  ink: CYBERPUNK_MATERIALS.asphalt,
  gold: CYBERPUNK_MATERIALS.amber,
  brass: CYBERPUNK_MATERIALS.steel,
  copper: '#A87964',
  paper: CYBERPUNK_MATERIALS.light,
  wood: '#80715F',
  floor: '#586771',
  stone: CYBERPUNK_MATERIALS.concrete,
  blossom: CYBERPUNK_MATERIALS.pink,
  glow: CYBERPUNK_MATERIALS.cyan,
  steam: '#BACAD0'
}

export const CYBERPUNK_SKINS: OfficeTheme['robot']['skins'] = {
  claude: {
    label: 'Civic wardens',
    body: CYBERPUNK_PALETTE.lacquer,
    trim: CYBERPUNK_PALETTE.gold,
    eye: CYBERPUNK_PALETTE.ink
  },
  codex: {
    label: 'Workshop crew',
    body: CYBERPUNK_PALETTE.brass,
    trim: CYBERPUNK_PALETTE.glow,
    eye: CYBERPUNK_PALETTE.ink
  },
  opencode: {
    label: 'Signal runners',
    body: CYBERPUNK_PALETTE.ink,
    trim: CYBERPUNK_PALETTE.blossom,
    eye: CYBERPUNK_PALETTE.glow
  }
}
