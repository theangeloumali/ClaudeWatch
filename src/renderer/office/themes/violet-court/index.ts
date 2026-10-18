import { BrassRoomSign } from '../BrassKit'
import type { OfficeTheme } from '../types'
import { CourtCompanyZone, CourtElevator, CourtProjectOffice, CourtSlab } from './CourtGrounds'
import { CourtLounge } from './CourtLounge'
import { CourtPilot } from './CourtPilot'
import { CourtDesk, CourtDoorway, CourtRoomDressing, CourtRoomFloors } from './CourtRoom'
import { CourtAmbient } from './CourtSurroundings'
import { CourtWalls } from './CourtWalls'
import { COURT, COURT_PALETTE } from './palette'
import { VIOLET_COURT_ID, violetCourtRoster } from './roster'
import { COURT_TOWN } from './town'

export const violetCourt: OfficeTheme = {
  id: VIOLET_COURT_ID,
  label: 'Violet Court',
  description: 'A royal court in violet, black and gold: pilots at their desks, knights parked.',
  palette: COURT_PALETTE,
  roster: violetCourtRoster,
  robot: {
    Model: CourtPilot,
    skins: {
      claude: { label: 'The Order', body: COURT.ink, trim: COURT.violet, eye: COURT.lumen },
      codex: { label: 'Lance Corps', body: COURT.ivory, trim: COURT.gold, eye: COURT.lumen },
      opencode: { label: 'Herald Guild', body: COURT.crimson, trim: COURT.marble, eye: COURT.gold }
    }
  },
  kit: {
    floor: { Slab: CourtSlab, Elevator: CourtElevator },
    zone: {
      CompanyZone: CourtCompanyZone,
      ProjectOffice: CourtProjectOffice,
      RoomFloors: CourtRoomFloors,
      Walls: CourtWalls,
      Doorway: CourtDoorway,
      Desk: CourtDesk,
      RoomDressing: CourtRoomDressing,
      // The door plaque is one shared textured sign in every theme.
      RoomSign: BrassRoomSign,
      Lounge: CourtLounge,
      Ambient: CourtAmbient
    }
  },
  town: COURT_TOWN
}
