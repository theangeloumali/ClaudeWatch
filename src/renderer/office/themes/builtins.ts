import { BRASS_TOWN } from './brass-town'
import { EDO_TOWN } from './edo-town'
import { ROBOT_PALETTE } from '../office-palette'
import { BrassAmbient } from './BrassAmbient'
import { BrassFrame } from './BrassFrame'
import { BrassLounge } from './BrassLounge'
import { EdoAmbient } from './EdoAmbient'
import { EdoLounge } from './EdoLounge'
import * as brass from './BrassKit'
import { SamuraiFrame } from './SamuraiFrame'
import { EdoRoomFloors, EdoSlab } from './EdoFloor'
import { EdoWalls } from './EdoWalls'
import { EdoDesk, EdoDoorway, EdoElevator, EdoRoomDressing, EdoRoomSign } from './EdoRoom'
import { EdoTower } from './EdoDistrict'
import { BRASS, EDO } from './palettes'
import { BrassCompanyZone, BrassProjectOffice, EdoCompanyZone, EdoProjectOffice } from './ZoneKits'
import type { OfficeTheme } from './types'
import { WORKSTATIONS } from './workstations'

export const neoEdoSteam: OfficeTheme = {
  id: 'neo-edo-steam',
  label: 'Neo Edo Steam',
  description: 'A lantern-lit cedar atelier within a vast steam-powered pagoda district.',
  palette: EDO,
  workstation: WORKSTATIONS.edo,
  town: EDO_TOWN,
  robot: {
    Model: SamuraiFrame,
    skins: {
      claude: { label: 'Ivory Crescent', body: EDO.paper, trim: EDO.gold, eye: EDO.glow },
      codex: { label: 'Crimson Reed', body: EDO.lacquer, trim: '#C5CED2', eye: '#5FE3D3' },
      opencode: { label: 'Verdigris Heron', body: EDO.copper, trim: EDO.ink, eye: EDO.blossom }
    }
  },
  kit: {
    floor: { Slab: EdoSlab, Elevator: EdoElevator },
    zone: {
      CompanyZone: EdoCompanyZone,
      ProjectOffice: EdoProjectOffice,
      RoomFloors: EdoRoomFloors,
      Walls: EdoWalls,
      Doorway: EdoDoorway,
      Desk: EdoDesk,
      RoomDressing: EdoRoomDressing,
      RoomSign: EdoRoomSign,
      Lounge: EdoLounge,
      Ambient: EdoAmbient
    }
  },
  world: { Tower: EdoTower }
}

export const brassWorkshop: OfficeTheme = {
  id: 'brass-workshop',
  label: 'Brass Workshop',
  description: 'The original brass hover automatons, copper archways and birdcage lift.',
  palette: BRASS,
  town: BRASS_TOWN,
  robot: {
    Model: BrassFrame,
    skins: {
      claude: { ...ROBOT_PALETTE.claude, label: 'Brass Warden' },
      codex: { ...ROBOT_PALETTE.codex, label: 'Copper Scout' },
      opencode: { ...ROBOT_PALETTE.opencode, label: 'Enamel Tinker' }
    }
  },
  kit: {
    floor: { Slab: brass.BrassSlab, Elevator: brass.BrassElevator },
    zone: {
      CompanyZone: BrassCompanyZone,
      ProjectOffice: BrassProjectOffice,
      RoomFloors: brass.BrassRoomFloors,
      Walls: brass.BrassWalls,
      Doorway: brass.BrassDoorway,
      Desk: brass.BrassDesk,
      RoomDressing: brass.BrassRoomDressing,
      RoomSign: brass.BrassRoomSign,
      Lounge: BrassLounge,
      Ambient: BrassAmbient
    }
  },
  world: { Tower: brass.BrassTower }
}
