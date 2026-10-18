import type { OfficeTheme } from '../types'
import { WORKSTATIONS } from '../workstations'
import { applyHumanPose } from '../corporate-city/human-pose'
import { playerCharacterGeometry } from '../character-geometry'
import { CyberpunkCharacter } from './CyberpunkCharacter'
import { CyberpunkTower } from './CyberpunkTower'
import { CYBERPUNK_KIT } from './office-kit'
import { CYBERPUNK_PALETTE, CYBERPUNK_SKINS } from './palette'
import { cyberpunkRoster } from './roster'
import { CYBERPUNK_TOWN } from './town'

export const cyberpunkCity: OfficeTheme = {
  id: 'cyberpunk-city',
  label: 'Cyberpunk City',
  description:
    'Tech-noir streets, luminous shopfronts and retrofitted apartments around open working offices.',
  palette: CYBERPUNK_PALETTE,
  workstation: WORKSTATIONS.corporate,
  roster: cyberpunkRoster,
  robot: { Model: CyberpunkCharacter, skins: CYBERPUNK_SKINS, applyPose: applyHumanPose },
  playerGeometry: (palette) => playerCharacterGeometry('courier', palette),
  kit: CYBERPUNK_KIT,
  world: { Tower: CyberpunkTower },
  town: CYBERPUNK_TOWN
}
