import type { ProviderId } from '../../shared/office/types'
import type { CardStatus } from './logic/name-cards'

// three.js materials cannot read Tailwind classes, so the scene keeps its colours here.
// The state colours mirror the Dispatch Deck tokens in tailwind.config.ts.
export const PROVIDER_LABEL: Record<ProviderId, string> = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode'
}

export const STATE_COLOR = {
  // Vermilion means "needs you" and nothing else, so both waiting states share it.
  permission: '#D8432F', // seal
  question: '#D8432F', // seal
  done: '#B3B9D6', // status.finished
  error: '#FFF0D2', // accent.hot
  limited: '#8F97BC', // text.tertiary
  working: '#5FD3C4' // status.active
} as const

export const CARD_STATUS_COLOR: Record<CardStatus, string> = {
  working: STATE_COLOR.working,
  waiting: STATE_COLOR.question,
  permission: STATE_COLOR.permission,
  done: STATE_COLOR.done,
  error: STATE_COLOR.error,
  limited: STATE_COLOR.limited,
  idle: STATE_COLOR.limited
}

// Mecha-steampunk kit (owner art direction 2026-10-11): muted metals and woods, status colours only for state.
export const STEAM = {
  brass: '#B08D57',
  copper: '#B87333',
  iron: '#3A3A40',
  ironLight: '#4A4A52',
  darkWood: '#5C4033',
  floorWood: '#8A6644',
  cream: '#E8DCC4',
  steam: '#F4F1EA',
  crtBody: '#2B2B30',
  crtScreen: '#6EF59A',
  lampGlow: '#FFD58A',
  rivetLight: '#FFB347',
  signText: '#2A2118',
  slab: '#2A2622'
} as const

export const SCENE_BACKGROUND = '#121629' // surface

export const MONITOR_COLORS = {
  background: SCENE_BACKGROUND,
  text: '#EFE6D2', // paper
  secondary: '#B3B9D6', // mist
  divider: '#353D6C' // border
} as const

export interface RobotPalette {
  body: string
  trim: string
  eye: string
}

export const ROBOT_PALETTE: Record<ProviderId, RobotPalette> = {
  claude: { body: STEAM.brass, trim: STEAM.copper, eye: '#FFB347' },
  codex: { body: '#4A4F57', trim: '#2FB3A6', eye: '#5FE3D3' },
  opencode: { body: STEAM.cream, trim: STEAM.iron, eye: STEAM.crtScreen }
}
