import { applyHumanPose } from '../corporate-city/human-pose'
import { HumanFrame } from '../corporate-city/HumanFrame'
import { corporatePlayerGeometry } from '../corporate-city/player-geometry'
import type { OfficeTheme } from '../types'
import { WORKSTATIONS } from '../workstations'
import { NIGHT_CAMPUS_KIT } from './office-kit'
import { NIGHT_CAMPUS_PALETTE, NIGHT_CAMPUS_SKINS } from './palette'

export const NIGHT_CAMPUS_ID = 'night-campus'

// Campus-only: the scene swaps it in while the world layout is Campus, never the picker.
export const nightCampus: OfficeTheme = {
  id: NIGHT_CAMPUS_ID,
  label: 'Night Campus',
  description: 'Open project rooms round a glowing hub.',
  palette: NIGHT_CAMPUS_PALETTE,
  workstation: WORKSTATIONS.corporate,
  robot: { Model: HumanFrame, skins: NIGHT_CAMPUS_SKINS, applyPose: applyHumanPose },
  playerGeometry: corporatePlayerGeometry,
  kit: NIGHT_CAMPUS_KIT
}
