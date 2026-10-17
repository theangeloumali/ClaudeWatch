import { BrassRoomSign } from '../BrassKit'
import type { OfficeTheme } from '../types'
import { GarrisonAmbient } from './GarrisonAmbient'
import { GarrisonCrew } from './GarrisonCrew'
import {
  GarrisonCompanyZone,
  GarrisonElevator,
  GarrisonProjectOffice,
  GarrisonSlab
} from './GarrisonGrounds'
import {
  GarrisonDesk,
  GarrisonDoorway,
  GarrisonRoomDressing,
  GarrisonRoomFloors
} from './GarrisonRoom'
import { GarrisonLounge } from './GarrisonSurroundings'
import { GarrisonWalls } from './GarrisonWalls'
import { GARRISON, GARRISON_PALETTE } from './palette'
import { ORBITAL_GARRISON_ID, orbitalGarrisonRoster } from './roster'
import { GARRISON_TOWN } from './town'

export const orbitalGarrison: OfficeTheme = {
  id: ORBITAL_GARRISON_ID,
  label: 'Orbital Garrison',
  description:
    'A hangar deck in gunmetal, white and hazard orange: crews at consoles, frames parked.',
  palette: GARRISON_PALETTE,
  roster: orbitalGarrisonRoster,
  robot: {
    Model: GarrisonCrew,
    skins: {
      claude: {
        label: 'Flight Wing',
        body: GARRISON.white,
        trim: GARRISON.orange,
        eye: GARRISON.ice
      },
      codex: {
        label: 'Deck Crew',
        body: GARRISON.orange,
        trim: GARRISON.white,
        eye: GARRISON.ice
      },
      opencode: {
        label: 'Signal Corps',
        body: GARRISON.navy,
        trim: GARRISON.steel,
        eye: GARRISON.white
      }
    }
  },
  kit: {
    floor: { Slab: GarrisonSlab, Elevator: GarrisonElevator },
    zone: {
      CompanyZone: GarrisonCompanyZone,
      ProjectOffice: GarrisonProjectOffice,
      RoomFloors: GarrisonRoomFloors,
      Walls: GarrisonWalls,
      Doorway: GarrisonDoorway,
      Desk: GarrisonDesk,
      RoomDressing: GarrisonRoomDressing,
      // The door plaque is one shared textured sign in every theme.
      RoomSign: BrassRoomSign,
      Lounge: GarrisonLounge,
      Ambient: GarrisonAmbient
    }
  },
  town: GARRISON_TOWN
}
