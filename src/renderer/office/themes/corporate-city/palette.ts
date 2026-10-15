import { ROBOT_PALETTE } from '../../office-palette'
import type { OfficeTheme, ThemePalette } from '../types'

// dry-new: contemporary materials replace the fantasy themes' architecture and cast.
export const CORPORATE_PALETTE: ThemePalette = {
  lacquer: '#344D5C',
  ink: '#26323B',
  gold: '#D4A666',
  brass: '#A8B8BC',
  copper: '#B87757',
  paper: '#E9EEF0',
  wood: '#B99270',
  floor: '#CBD4D7',
  stone: '#BAC5C7',
  blossom: '#799B86',
  glow: '#72C3CC',
  steam: '#F0F4F5'
}

export const CORPORATE_MATERIALS = {
  facade: '#E1E6E5',
  concrete: '#ABB7BA',
  frame: '#34434B',
  glass: '#7899AC',
  roof: '#697D86',
  road: '#425159',
  sidewalk: '#D3DEDC',
  park: '#789D83',
  foliage: '#50745D',
  retail: '#B18E68',
  civic: '#5F879A',
  residential: '#94A8AE',
  culture: '#BD917F',
  workshop: '#809495',
  light: '#DFEEE9',
  screen: '#477E94',
  keyboard: '#4B5B65',
  shoe: '#374149',
  badge: '#F0F4F5'
}

export const HUMAN_SKIN_TONES = [
  '#E9C5A5',
  '#D8AF90',
  '#B88769',
  '#946B52',
  '#704B3D',
  '#50392F'
] as const
export const HUMAN_HAIR_COLORS = [
  '#3B332F',
  '#574336',
  '#8B6F51',
  '#C7B89F',
  '#625A57',
  '#292A2C'
] as const
export const HUMAN_CLOTHING_COLORS = [
  '#687F8B',
  '#819B8D',
  '#A58B7A',
  '#546A78',
  '#9C9C94',
  '#647D73'
] as const

export const HUMAN_SKINS: OfficeTheme['robot']['skins'] = {
  claude: { ...ROBOT_PALETTE.claude, label: 'Claude' },
  codex: { ...ROBOT_PALETTE.codex, label: 'Codex' },
  opencode: { ...ROBOT_PALETTE.opencode, label: 'OpenCode' }
}
