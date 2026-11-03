import {
  CorporateCompanyZone,
  CorporateProjectOffice,
  CorporateSlab
} from '../corporate-city/CorporateGrounds'
import { CorporateRoomFloors } from '../corporate-city/CorporateRoom'
import type { OfficeTheme } from '../types'
import { CampusDesk } from './CampusDesk'

// Open plan: the room shell is drawn per floor by NightCampusRoom, so these stay empty.
const Nothing = () => null

// Slab, company and project grounds only draw under a roof, which Campus never has.
export const NIGHT_CAMPUS_KIT: OfficeTheme['kit'] = {
  floor: { Slab: CorporateSlab, Elevator: Nothing },
  zone: {
    CompanyZone: CorporateCompanyZone,
    ProjectOffice: CorporateProjectOffice,
    RoomFloors: CorporateRoomFloors,
    Walls: Nothing,
    Doorway: Nothing,
    Desk: CampusDesk,
    RoomDressing: Nothing,
    RoomSign: Nothing
  }
}
