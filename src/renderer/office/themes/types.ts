import type { ComponentType, RefObject } from 'react'
import type { BufferGeometry, Group, Mesh } from 'three'
import type { RobotMood, RobotPose } from '../logic/character-pose'
import type { AgentView, ProviderId } from '../../../shared/office/types'
import type {
  DeskSlot,
  FloorGeometry,
  LoungeGeometry,
  RoomGeometry,
  ZoneGeometry
} from '../scene-model'
import type { WallsMode } from '../logic/room-layout'
import type { TownDress } from '../town/town-dress'
import type { PlacedLot } from './lot-kit'
import type { Lot } from './surroundings'

export interface ThemePalette {
  lacquer: string
  ink: string
  gold: string
  brass: string
  copper: string
  paper: string
  wood: string
  floor: string
  stone: string
  blossom: string
  glow: string
  steam: string
}

// dead-code-allowed: plug-in contract type that each team's theme implements 2027-01-31
interface RobotSkin {
  label: string
  body: string
  trim: string
  eye: string
}

export interface RobotRig {
  body: RefObject<Group | null>
  head: RefObject<Group | null>
  leftArm: RefObject<Group | null>
  rightArm: RefObject<Group | null>
  gear: RefObject<Group | null>
  legs: RefObject<Group | null>
  base: RefObject<Group | null>
  sensor: RefObject<Group | null>
  eye: RefObject<Mesh | null>
  thought: RefObject<Group | null>
  puffs: readonly RefObject<Mesh | null>[]
  leftElbow?: RefObject<Group | null>
  rightElbow?: RefObject<Group | null>
  leftHip?: RefObject<Group | null>
  rightHip?: RefObject<Group | null>
  leftKnee?: RefObject<Group | null>
  rightKnee?: RefObject<Group | null>
}

export interface ThemePoseOptions {
  mood: RobotMood
  time: number
  phase: number
  delta: number
  isReducedMotion: boolean
  isMoving?: boolean
  travelDistance?: number
  isSubagent?: boolean
  isInLounge?: boolean
  seatPresence?: 'workstation' | 'lounge' | 'none'
}

// Root translation, scale, hit capsule and selection remain owned by Robot's controller.
export interface RobotModelProps {
  agent: AgentView
  skin: RobotSkin
  // The office bay of the agent's room: with the agent's key, a stable pick from a theme's cast.
  rosterIndex: number
  rig: RobotRig
  isReducedMotion: boolean
}

export interface FloorProps {
  floor: FloorGeometry
}
// The rooms one theme owns on a floor that may mix themes.
export interface RoomsProps {
  rooms: readonly RoomGeometry[]
}
export interface WallsProps extends RoomsProps {
  mode: WallsMode
  isReducedMotion: boolean
}
export interface RoomProps {
  room: RoomGeometry
}
export interface ZoneProps {
  zone: ZoneGeometry
}
export interface DeskProps extends RoomProps {
  slot: DeskSlot
}

// Authored desk-local coordinates; the screen faces toward the seated worker (-Z).
export interface WorkstationSpec {
  screen: readonly [number, number, number]
  width: number
  height: number
}
export interface LoungeProps {
  lounge: LoungeGeometry
}
export interface AmbientProps {
  floor: FloorGeometry
  lots: readonly Lot[]
  isReducedMotion: boolean
  // What the zoned town drew on `lots`: movers keep to the buildings actually there.
  placed?: readonly PlacedLot[]
}
export interface TowerFloor {
  floorId: string
  label: string
  agentCount?: number
  attentionCount: number
}
export interface TowerProps {
  // Unused by the office since the one-floor model; the Tower is a landmark only.
  onFocusFloor?: (floorId: string) => void
  floors: readonly TowerFloor[]
  plot?: Pick<Lot, 'width' | 'depth' | 'maxHeight'>
}

// Drawn once per floor, by the floor's default theme.
// dead-code-allowed: plug-in contract type each theme's floor kit implements 2027-01-31
interface FloorKit {
  Slab: ComponentType<FloorProps>
  Elevator: ComponentType<FloorProps>
}

// Drawn per zone, by the theme that zone resolves to; several can share one floor.
// dead-code-allowed: plug-in contract type each theme's zone kit implements 2027-01-31
interface ZoneKit {
  // Offices within offices: a company's fenced grounds and a project's walled office.
  CompanyZone: ComponentType<ZoneProps>
  ProjectOffice: ComponentType<ZoneProps>
  RoomFloors: ComponentType<RoomsProps>
  Walls: ComponentType<WallsProps>
  Doorway: ComponentType<RoomProps>
  Desk: ComponentType<DeskProps>
  RoomDressing: ComponentType<RoomProps>
  RoomSign: ComponentType<RoomProps>
  // A company's place to rest: agents whose turn is done sit at `lounge.seats`.
  Lounge?: ComponentType<LoungeProps>
  // A theme's moving things. Move them in useFrame and never invalidate: the scene paces frames.
  Ambient?: ComponentType<AmbientProps>
}

// A character an agent plays, as the HUD names it.
export interface RosterEntry {
  id: string
  name: string
  role: string
}

// What casts an agent. Without a key (a caller that knows only the provider) the bay decides.
export type RosterAgent = Pick<AgentView, 'provider' | 'isSubagent'> &
  Partial<Pick<AgentView, 'agentKey'>>

export interface ThemeRoster {
  // The cast, with any names the owner changed on this machine.
  entries(storage?: Pick<Storage, 'getItem'> | null): RosterEntry[]
  // Which entry an agent plays: its provider picks the faction, its own key and its office
  // bay the character, so it keeps that character for as long as it lives.
  indexFor(agent: RosterAgent, bay: number): number
}

export interface OfficeTheme {
  id: string
  label: string
  description: string
  palette: ThemePalette
  workstation?: WorkstationSpec
  // Absent in a theme without a cast: its agents play no named character.
  roster?: ThemeRoster
  // Zone-scoped, like the zone kit: a robot wears the theme of its own room.
  robot: {
    Model: ComponentType<RobotModelProps>
    skins: Record<ProviderId, RobotSkin>
    applyPose?: (rig: RobotRig, pose: RobotPose, options: ThemePoseOptions) => void
  }
  playerGeometry?: (palette: ThemePalette) => BufferGeometry
  kit: { floor: FloorKit; zone: ZoneKit }
  // Floor-scoped: one horizon, from the floor's default theme.
  world: {
    Tower: ComponentType<TowerProps>
  }
  // The theme's share of the zoned town, as data. Absent until the theme has drawn it.
  town?: TownDress
}
