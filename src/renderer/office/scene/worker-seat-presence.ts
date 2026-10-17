import { isAtRest } from '../../../shared/office/attention'
import type { AgentView } from '../../../shared/office/types'
import type { DeskSlot, FloorGeometry, ZoneGeometry } from '../scene-model'
import type { ThemeZoneGroup } from '../logic/office-themes'
import { workstationSeat } from '../logic/workstation-framing'
import { agentElevation, floorElevation, physicalFloorId } from './all-floor-model'
import type { ThemePoseOptions } from '../themes/types'

const SEAT_ARRIVAL_METRES = 0.16

interface SeatPoint {
  x: number
  y: number
  z: number
}

// dry-new: workstationSeat finds a reservation; posing also needs physical chair arrival.
export interface WorkerSeats {
  workstation: DeskSlot | null
  workstationY: number
  lounge: readonly SeatPoint[]
}

const cornerSeatsOf = (companies: readonly ZoneGeometry[], y: number): SeatPoint[] =>
  companies.flatMap((company) => (company.lounge?.seats ?? []).map((seat) => ({ ...seat, y })))

// Every game corner seat on a floor, at that floor's height.
const loungeSeatsOn = (floor: FloorGeometry): SeatPoint[] =>
  cornerSeatsOf(floor.zones, floorElevation(floor))

const isAtSeat = (point: SeatPoint, seat: SeatPoint): boolean =>
  Math.hypot(point.x - seat.x, point.y - seat.y, point.z - seat.z) <= SEAT_ARRIVAL_METRES

const simSpotOf = (agent: AgentView): SeatPoint => ({
  x: agent.x,
  y: agentElevation(agent),
  z: agent.z
})

// At rest in the corner with its sim spot on a seat; the sim marks the trip from its first step.
function isPlayingOnSeat(agent: AgentView, seats: readonly SeatPoint[]): boolean {
  return (
    agent.place === 'lounge' &&
    isAtRest(agent) &&
    seats.some((seat) => isAtSeat(simSpotOf(agent), seat))
  )
}

// Whether an agent plays on a corner seat of the floor it stands on, for a frame of many agents.
export function createGamingCheck(floors: readonly FloorGeometry[]): (agent: AgentView) => boolean {
  const seats = new Map(floors.map((floor) => [floor.floorId, loungeSeatsOn(floor)]))
  return (agent) => isPlayingOnSeat(agent, seats.get(physicalFloorId(agent) ?? '') ?? [])
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
  let lounge: SeatPoint[] = []
  if (presence) lounge = loungeSeatsOn(presence)
  else if (!floors)
    lounge = cornerSeatsOf(
      zoneGroups.flatMap((group) => group.companies),
      0
    )
  return { workstation, workstationY: home ? floorElevation(home) : 0, lounge }
}

export function workerSeatPresence({
  agent,
  position,
  seats,
  isMoving
}: {
  agent: AgentView
  position: SeatPoint
  seats: WorkerSeats
  isMoving: boolean
}): NonNullable<ThemePoseOptions['seatPresence']> {
  if (isMoving) return 'none'
  const isAt = (seat: SeatPoint): boolean =>
    isAtSeat(position, seat) && isAtSeat(simSpotOf(agent), seat)
  if (seats.workstation && isAt({ ...seats.workstation, y: seats.workstationY }))
    return 'workstation'
  // Drawn on the very seat its sim spot is on, not passing over another one.
  if (isPlayingOnSeat(agent, seats.lounge) && seats.lounge.some(isAt)) return 'lounge'
  return 'none'
}
