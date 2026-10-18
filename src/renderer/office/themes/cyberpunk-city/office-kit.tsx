import { FURNITURE_SCALE } from '../../../../shared/office/figure-scale'
import { CompanyGrounds, FloorSlab, LiftAt, ProjectRoom } from '../ZoneArchitecture'
import { Parts, box } from '../parts'
import type { FloorProps, LoungeProps, OfficeTheme, ZoneProps } from '../types'
import { CYBERPUNK_ENTRY, CYBERPUNK_LIFT, CYBERPUNK_SEAT } from './furniture'
import { CYBERPUNK_PALETTE as palette } from './palette'
import {
  CyberpunkDesk,
  CyberpunkDoorway,
  CyberpunkRoomDressing,
  CyberpunkRoomFloors,
  CyberpunkRoomSign
} from './CyberpunkRoom'
import { CyberpunkWalls } from './CyberpunkWalls'

function CyberpunkSlab({ floor }: FloorProps) {
  return <FloorSlab floor={floor} ground={palette.stone} lane={palette.ink} />
}
function CyberpunkElevator({ floor }: FloorProps) {
  return <LiftAt floor={floor} parts={CYBERPUNK_LIFT} />
}
function CyberpunkCompanyZone({ zone }: ZoneProps) {
  return <CompanyGrounds zone={zone} palette={palette} gate={<Parts parts={CYBERPUNK_ENTRY} />} />
}
const PROJECT_PALETTE = { ...palette, paper: palette.brass }
function CyberpunkProjectOffice({ zone }: ZoneProps) {
  return (
    <group scale={[1, 0.6, 1]}>
      <ProjectRoom zone={zone} palette={PROJECT_PALETTE} />
    </group>
  )
}
function CyberpunkLounge({ lounge }: LoungeProps) {
  return (
    <group>
      <Parts
        parts={[
          box([lounge.x, 0.012, lounge.z], [lounge.width, 0.012, lounge.depth], palette.floor)
        ]}
      />
      {lounge.seats.map((seat) => (
        <group
          key={seat.slotId}
          position={[seat.x, 0, seat.z]}
          rotation={[0, seat.heading, 0]}
          scale={FURNITURE_SCALE}
        >
          <Parts parts={CYBERPUNK_SEAT} />
        </group>
      ))}
    </group>
  )
}

export const CYBERPUNK_KIT: OfficeTheme['kit'] = {
  floor: { Slab: CyberpunkSlab, Elevator: CyberpunkElevator },
  zone: {
    CompanyZone: CyberpunkCompanyZone,
    ProjectOffice: CyberpunkProjectOffice,
    RoomFloors: CyberpunkRoomFloors,
    Walls: CyberpunkWalls,
    Doorway: CyberpunkDoorway,
    Desk: CyberpunkDesk,
    RoomDressing: CyberpunkRoomDressing,
    RoomSign: CyberpunkRoomSign,
    Lounge: CyberpunkLounge
  }
}
