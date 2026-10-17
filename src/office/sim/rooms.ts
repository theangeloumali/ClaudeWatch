import { FURNITURE_SCALE } from '../../shared/office/figure-scale'
import { SUBAGENT_BODY_RADIUS } from '../../shared/office/body-footprints'
import type { Point } from './path'

// The two seats beside a lead's desk. Every guest past them takes a seat in the team area.
export const GUEST_DESK_IDS = ['desk_guest_0', 'desk_guest_1'] as const
export const teamSeatsFor = (subagentCount: number): number =>
  Math.max(0, subagentCount - GUEST_DESK_IDS.length)

export interface Slot extends Point {
  id: string
  heading: number
}
export interface Bounds extends Point {
  width: number
  depth: number
  door: Point
}
// An open seating area in a company's grounds: no walls, so the path grid walks straight in.
export interface LoungeLayout extends Bounds {
  id: string
  slots: Slot[]
}
export interface ZoneLayout extends Bounds {
  id: string
  kind: 'company' | 'project' | 'office' | 'team'
  label: string
  companyKey: string
  projectKey: string | null
  sessionKey: string | null
  capacity: number
  // Order only: a company's side of the street and place in its row, a project's place in its
  // company. No size or position is ever read back from it.
  index: number
  children: ZoneLayout[]
  // Company zones only.
  lounge?: LoungeLayout
  displayLabel?: string
  themeId?: string
  buildingId?: string
  floorId?: string
  floorNumber?: number
  elevation?: number
}
export interface RoomLayout extends ZoneLayout {
  kind: 'office' | 'team'
  worktree: string | null
  plate: number
  bay: number
  slots: Slot[]
  worldTarget?: string
}
export interface FloorLayout {
  id: string
  label: string
  // The plate's centre, in the same metres as everything on it: the gate is the origin.
  x: number
  z: number
  width: number
  depth: number
  rooms: RoomLayout[]
  zones: ZoneLayout[]
  elevator: Slot
  buildingId?: string
  floorNumber?: number
  elevation?: number
  displayLabel?: string
  themeId?: string
  connector?: Bounds
  entrance?: Slot
}

// The lounge was laid out for agents at their old size: every length of it grows with them.
export const loungeMetres = (metres: number): number => metres * FURNITURE_SCALE
export const LOUNGE_WIDTH = loungeMetres(6)
export const LOUNGE_SEATS_PER_ROW = 4

export function bounds(left: number, top: number, width: number, depth: number): Bounds {
  return {
    x: left + width / 2,
    z: top + depth / 2,
    width,
    depth,
    door: { x: left + width / 2, z: top }
  }
}

interface ProjectPlan {
  width: number
  depth: number
  capacity: number
  teamSeatsPerRow: number
}

const DESK_PITCH = 5
const DESK_ROW_PITCH = 6
// Two seated bodies must leave an aisle wide enough for another body and grid rounding.
const SEAT_PITCH = SUBAGENT_BODY_RADIUS * 4 + 0.4

function teamSize(seats: number, seatsPerRow: number): { width: number; depth: number } {
  return {
    width: Math.min(seats, seatsPerRow) * SEAT_PITCH + 2,
    depth: Math.ceil(seats / seatsPerRow) * SEAT_PITCH + 2
  }
}

// A desk column per session up to four, then further rows. The team area sits under the desks,
// as wide and deep as its seats only, and is left out when it has none.
export function planProject(sessionCount: number, teamSeats: number): ProjectPlan {
  const columns = Math.min(4, sessionCount)
  const rows = Math.ceil(sessionCount / 4)
  const teamSeatsPerRow = Math.max(4, Math.floor((columns * DESK_PITCH - 3) / SEAT_PITCH))
  const desks = { width: columns * DESK_PITCH + 1, depth: rows * DESK_ROW_PITCH + 2 }
  const team = teamSize(teamSeats, teamSeatsPerRow)
  return {
    width: teamSeats ? Math.max(desks.width, team.width + 2) : desks.width,
    depth: teamSeats ? desks.depth + 2 + team.depth : desks.depth,
    capacity: rows * 4,
    teamSeatsPerRow
  }
}

export function loungeDepth(seats: number): number {
  return loungeMetres(3 + Math.ceil(seats / LOUNGE_SEATS_PER_ROW) * 2)
}

// `growsNorth` is for a company north of the street: its rows start at the street side, the
// south edge, so a row added later leaves the earlier ones where they are.
export function lounge(
  companyId: string,
  left: number,
  top: number,
  seats: number,
  growsNorth: boolean
): LoungeLayout {
  const depth = loungeDepth(seats)
  const rowZ = (row: number): number =>
    growsNorth ? top + depth - loungeMetres(3 + row * 2) : top + loungeMetres(2 + row * 2)
  return {
    ...bounds(left, top, LOUNGE_WIDTH, depth),
    id: `${companyId}:lounge`,
    // Seats face +z like desk seats, in rows of four.
    slots: Array.from({ length: seats }, (_, index) => ({
      id: `lounge_seat_${index}`,
      x: left + loungeMetres(1.125 + (index % LOUNGE_SEATS_PER_ROW) * 1.25),
      z: rowZ(Math.floor(index / LOUNGE_SEATS_PER_ROW)),
      heading: 0
    }))
  }
}

export function room(
  project: ZoneLayout,
  bay: number,
  sessionKey: string | null,
  label: string,
  worktree: string | null,
  placement: { growsNorth: boolean; seats?: number; seatsPerRow?: number }
): RoomLayout {
  const { growsNorth, seats = 0, seatsPerRow = 1 } = placement
  const left = project.x - project.width / 2
  const top = project.z - project.depth / 2
  const bottom = top + project.depth
  const isTeam = sessionKey === null
  const rows = project.capacity / 4
  const team = teamSize(seats, seatsPerRow)
  // North of the street a project stacks from its south edge: desk rows, then the team area
  // past them. Either way a row or a seat added later leaves the earlier ones in place.
  const deskRowsDepth = rows * DESK_ROW_PITCH
  const teamTop = growsNorth ? bottom - 1 - deskRowsDepth - team.depth : top + 3 + deskRowsDepth
  const deskRow = Math.floor(bay / 4) * DESK_ROW_PITCH
  const geometry = isTeam
    ? bounds(left + 1, teamTop, team.width, team.depth)
    : bounds(
        left + 1 + (bay % 4) * DESK_PITCH,
        growsNorth ? bottom - 5 - deskRow : top + 3 + deskRow,
        4,
        4
      )
  const seatRowZ = (row: number): number =>
    growsNorth ? teamTop + team.depth - 2 - row * SEAT_PITCH : teamTop + 2 + row * SEAT_PITCH
  // Seats face +z, toward the default camera; the scene draws each desk 0.62 m in front of
  // its seat, so every seat keeps that strip clear of walls and of the other seats.
  const slot = (id: string, x: number, z: number): Slot => ({ id, x, z, heading: 0 })
  const slots = isTeam
    ? Array.from({ length: seats }, (_, index) =>
        slot(
          `team_seat_${index}`,
          left + 3 + (index % seatsPerRow) * SEAT_PITCH,
          seatRowZ(Math.floor(index / seatsPerRow))
        )
      )
    : [
        slot('desk_main', geometry.x, geometry.z + 0.3),
        // 1.25 m either side: the lead's wider figure clears both guest desks.
        ...GUEST_DESK_IDS.map((id, side) =>
          slot(id, geometry.x + (side ? 1.25 : -1.25), geometry.z - 0.95)
        )
      ]
  return {
    ...geometry,
    id: isTeam ? `${project.id}:team` : `${project.id}:office:${bay}`,
    kind: isTeam ? 'team' : 'office',
    label,
    companyKey: project.companyKey,
    projectKey: project.projectKey,
    sessionKey,
    worktree,
    plate: 0,
    bay,
    capacity: isTeam ? seats : 1,
    index: bay,
    children: [],
    slots: [slot('door', geometry.door.x, geometry.door.z), ...slots]
  }
}
