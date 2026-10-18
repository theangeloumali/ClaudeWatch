import type { OfficeTheme } from '../types'
import { WORKSTATIONS } from '../workstations'
import { CorporateTower } from './CorporateTower'
import { HumanFrame } from './HumanFrame'
import { applyHumanPose } from './human-pose'
import { CORPORATE_KIT } from './office-kit'
import { CORPORATE_PALETTE, HUMAN_SKINS } from './palette'
import { corporatePlayerGeometry } from './player-geometry'
import { CORPORATE_TOWN } from './town'

export const corporateCity: OfficeTheme = {
  id: 'corporate-city',
  label: 'Corporate City',
  description:
    'A contemporary business district with human-shaped software agents and open working offices.',
  palette: CORPORATE_PALETTE,
  workstation: WORKSTATIONS.corporate,
  robot: { Model: HumanFrame, skins: HUMAN_SKINS, applyPose: applyHumanPose },
  playerGeometry: corporatePlayerGeometry,
  kit: CORPORATE_KIT,
  world: { Tower: CorporateTower },
  town: CORPORATE_TOWN
}
