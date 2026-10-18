import { applyHumanPose } from '../corporate-city/human-pose'
import type { OfficeTheme } from '../types'
import { WORKSTATIONS } from '../workstations'
import { SamuraiHuman } from './SamuraiHuman'
import {
  SamuraiCompanyZone,
  SamuraiElevator,
  SamuraiProjectOffice,
  SamuraiSlab
} from './SamuraiGrounds'
import { SamuraiLounge } from './SamuraiLounge'
import {
  SamuraiDesk,
  SamuraiDoorway,
  SamuraiRoomDressing,
  SamuraiRoomFloors,
  SamuraiRoomSign,
  SamuraiWalls
} from './SamuraiRoom'
import { SamuraiTower } from './SamuraiTower'
import { SAMURAI_PALETTE, SAMURAI_SKINS } from './palette'
import { samuraiPlayerGeometry } from './player-geometry'
import { SAMURAI_TOWN } from './town'

export const samuraiEmpire: OfficeTheme = {
  id: 'samurai-empire',
  label: 'Samurai Empire',
  description:
    'Human artisans in segmented cybernetic armor inhabit mineral canal courts, repair arcades, and terraced data keeps.',
  palette: SAMURAI_PALETTE,
  workstation: WORKSTATIONS.samurai,
  robot: { Model: SamuraiHuman, skins: SAMURAI_SKINS, applyPose: applyHumanPose },
  playerGeometry: samuraiPlayerGeometry,
  kit: {
    floor: { Slab: SamuraiSlab, Elevator: SamuraiElevator },
    zone: {
      CompanyZone: SamuraiCompanyZone,
      ProjectOffice: SamuraiProjectOffice,
      RoomFloors: SamuraiRoomFloors,
      Walls: SamuraiWalls,
      Doorway: SamuraiDoorway,
      Desk: SamuraiDesk,
      RoomDressing: SamuraiRoomDressing,
      RoomSign: SamuraiRoomSign,
      Lounge: SamuraiLounge
    }
  },
  world: { Tower: SamuraiTower },
  town: SAMURAI_TOWN
}
