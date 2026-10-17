import { isAtRest } from '../../../shared/office/attention'
import type { AgentView } from '../../../shared/office/types'
import type { DeskSlot, FloorGeometry } from '../scene-model'
import type { ThemeZoneGroup } from '../logic/office-themes'
import { workstationSeat } from '../logic/workstation-framing'
import { floorElevation, physicalFloorId } from './all-floor-model'
import type { ThemePoseOptions } from '../themes/types'

const SEAT_ARRIVAL_METRES = 0.16

// dry-new: workstationSeat finds a reservation; posing also needs physical chair arrival.
export interface WorkerSeats {
  workstation: DeskSlot | null
  workstationY: number
  lounge: readonly { x: number; z: number; y: number }[]
}

export function workerSeats({
  agent,
  floors,
  zoneGroups
}: {
  agent: AgentView
  floors?: readonly FloorGeometry[]
  zoneGroups: readonly ThemeZoneGroup[]
}): WorkerSeats {
  const home = floors?.find((floor) => floor.floorId === agent.floorId)
  const presence = floors?.find((floor) => floor.floorId === physicalFloorId(agent))
  const room = zoneGroups.flatMap((group) => group.rooms).find((room) => room.id === agent.roomId)
  let workstation: DeskSlot | null = null
  if (home) workstation = workstationSeat(agent, home)
  else if (!floors) workstation = room?.seats.find((seat) => seat.slotId === agent.slotId) ?? null
  const lounge: { x: number; z: number; y: number }[] = []
  const companies =
    presence?.zones ?? (!floors ? zoneGroups.flatMap((group) => group.companies) : [])
  for (const company of companies)
    for (const seat of company.lounge?.seats ?? [])
      lounge.push({ ...seat, y: presence ? floorElevation(presence) : 0 })
  return { workstation, workstationY: home ? floorElevation(home) : 0, lounge }
}

export function workerSeatPresence({
  agent,
  position,
  seats,
  isMoving
}: {
  agent: AgentView
  position: { x: number; y: number; z: number }
  seats: WorkerSeats
  isMoving: boolean
}): NonNullable<ThemePoseOptions['seatPresence']> {
  if (isMoving) return 'none'
  const isAt = (seat: { x: number; y: number; z: number }): boolean =>
    Math.hypot(position.x - seat.x, position.y - seat.y, position.z - seat.z) <=
      SEAT_ARRIVAL_METRES &&
    Math.hypot(agent.x - seat.x, (agent.elevation ?? 0) - seat.y, agent.z - seat.z) <=
      SEAT_ARRIVAL_METRES
  if (seats.workstation && isAt({ ...seats.workstation, y: seats.workstationY }))
    return 'workstation'
  if (isAtRest(agent) && agent.place === 'lounge' && seats.lounge.some(isAt)) return 'lounge'
  return 'none'
}
