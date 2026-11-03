import type { CampusRoomColors } from '../../logic/campus-colors'
import { CORPORATE_PALETTE } from '../corporate-city/palette'
import type { OfficeTheme, ThemePalette } from '../types'

// Corporate furniture on a dark campus: white desk tops, warm trim and glow.
export const NIGHT_CAMPUS_PALETTE: ThemePalette = {
  ...CORPORATE_PALETTE,
  wood: '#F4F1EA',
  brass: '#F2E6CF',
  glow: '#FFD27A'
}

// Room colours come from campusRoomColors; these props are shared, mostly corporate tokens.
export const BOOK_COLORS = ['#E85D5D', '#F2B544', '#4F8FE0', '#5CC28A', '#B57BE0'] as const
export const CHART_SCREEN_COLOR = '#151A22'
export const SOFA_COLOR = '#5B6B8C'
export const CUSHION_COLOR = '#8EA0C4'
// Brighter than the corporate foliage, so plants still read green on a saturated slab.
export const PLANT_GREEN = '#3FBF5F'
export const LAMP_SHADE_COLOR = '#FFF1CF'

// Brighter provider colours than the corporate cast: badges and rings read on the dark ground.
export const NIGHT_CAMPUS_SKINS: OfficeTheme['robot']['skins'] = {
  claude: { label: 'Claude', body: '#F4A261', trim: '#FFB37A', eye: '#FFE0B8' },
  codex: { label: 'Codex', body: '#5AD1C3', trim: '#7BE8DA', eye: '#D4FFF8' },
  opencode: { label: 'OpenCode', body: '#8FA8FF', trim: '#B3C3FF', eye: '#E6ECFF' }
}

// A floor with no project key yet has no ring colour; it stays neutral until it gets one.
export const UNKEYED_ROOM_COLORS: CampusRoomColors = {
  slab: CORPORATE_PALETTE.stone,
  rug: CORPORATE_PALETTE.paper,
  wall: CORPORATE_PALETTE.lacquer,
  chip: CORPORATE_PALETTE.glow
}
