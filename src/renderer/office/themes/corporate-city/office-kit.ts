import type { OfficeTheme } from '../types'
import {
  CorporateCompanyZone,
  CorporateElevator,
  CorporateProjectOffice,
  CorporateSlab
} from './CorporateGrounds'
import { CorporateLounge } from './CorporateLounge'
import {
  CorporateDesk,
  CorporateDoorway,
  CorporateRoomDressing,
  CorporateRoomFloors,
  CorporateRoomSign
} from './CorporateRoom'
import { CorporateWalls } from './CorporateWalls'

export const CORPORATE_KIT: OfficeTheme['kit'] = {
  floor: { Slab: CorporateSlab, Elevator: CorporateElevator },
  zone: {
    CompanyZone: CorporateCompanyZone,
    ProjectOffice: CorporateProjectOffice,
    RoomFloors: CorporateRoomFloors,
    Walls: CorporateWalls,
    Doorway: CorporateDoorway,
    Desk: CorporateDesk,
    RoomDressing: CorporateRoomDressing,
    RoomSign: CorporateRoomSign,
    Lounge: CorporateLounge
  }
}
