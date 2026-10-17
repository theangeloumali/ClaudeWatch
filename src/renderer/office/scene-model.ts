import type {
  AccountRef,
  AgentView,
  FocusResult,
  InteractionResult,
  PeekResult,
  PermissionDecision,
  ProjectTokens,
  ProviderId,
  SessionRef,
  SourceHealth
} from '../../shared/office/types'
import type { BodyFootprint } from '../../shared/office/body-footprints'
import type { WorldDocumentStore } from '../office-live/world-document-store'
import type { WorldVenue } from '../../shared/office/world-document'

// All lengths in metres, floor-local, 1 unit = 1 m, Y up. Plain data: Phase 6 maps the sim's LayoutMap into it.
// The floor-local origin is the gate, where agents walk in; the plate has its own centre
// (FloorGeometry x/z). Room x/z is the room centre.
export interface DeskSlot {
  slotId: string
  x: number
  z: number
  // Yaw in radians; the character faces (sin heading, cos heading) on the XZ plane.
  heading: number
}

export interface RoomGeometry {
  worldTarget?: string
  themeId?: string
  id: string
  sessionKey: string | null
  x: number
  z: number
  width: number
  depth: number
  door: { x: number; z: number }
  label: string
  kind: 'office' | 'team'
  // The session's reserved bay in its project; a team room has none.
  bay?: number
  // Where the sim seats agents; the scene draws one desk in front of each.
  seats: DeskSlot[]
}

// Offices within offices: a company zone holds its project offices, each holding one office per
// agent session (plus a team area for overflow subagents). Centre-based metres, like RoomGeometry.
type ZoneKind = 'company' | 'project' | 'office' | 'team'

// A company's open seating area. It is not a room, so no desk is drawn for its seats.
export interface LoungeGeometry {
  id: string
  x: number
  z: number
  width: number
  depth: number
  door: { x: number; z: number }
  seats: DeskSlot[]
}

export interface ZoneGeometry {
  id: string
  kind: ZoneKind
  label: string
  x: number
  z: number
  width: number
  depth: number
  door: { x: number; z: number } | null
  companyKey: string | null
  projectKey: string | null
  sessionKey: string | null
  children: ZoneGeometry[]
  // Company zones only.
  lounge?: LoungeGeometry
}

export interface FloorGeometry {
  streetBlocks?: { x: number; z: number; width: number; depth: number }[]
  buildingId?: string
  floorNumber?: number
  elevation?: number
  connector?: { x: number; z: number }
  entrance?: { x: number; z: number }
  floorId: string
  label: string
  plate: number
  // The plate's centre, measured from the gate like everything else on the floor.
  x: number
  z: number
  width: number
  depth: number
  corridor: { z: number; width: number }
  rooms: RoomGeometry[]
  // Company zones, outermost first; rooms are the leaf offices the current scene draws.
  zones: ZoneGeometry[]
  elevator: { x: number; z: number }
}

export interface OfficeFrame {
  floors: FloorGeometry[]
  agents: AgentView[]
  sessions: SessionRef[]
  // False until the bridge's first snapshot arrives, so "no agents" is not shown while connecting.
  connected: boolean
  sources: SourceHealth[]
  // Labels only (never an address); absent when accounts are not being watched.
  accounts?: AccountRef[]
  // Today's tokens per project from the accounts ledger; absent on a host without one.
  projectsToday?: readonly ProjectTokens[]
  feedReceivedAtMs?: number
  feedRevision?: number
  // Moves when the agents change in anything but their poses; absent from feeds that keep none.
  structureRevision?: number
  worldRevision?: number
  venues?: readonly WorldVenue[]
}

export interface OfficeFeed {
  getWorldDocumentStore?(): WorldDocumentStore | null
  // Local renderer simulation only; no body positions are sent to a provider or backend.
  setBodyObstacles?: (bodies: readonly BodyFootprint[]) => void
  // Set by a page that may only watch: the HUD then leaves out what would be refused.
  isViewOnly?: boolean
  subscribe(listener: (frame: OfficeFrame) => void): () => void
  // `agentKey` is a session key, or `${sessionKey}#${memberId}` for a subagent or teammate.
  focus(agentKey: string): Promise<FocusResult>
  send(sessionKey: string, text: string): Promise<InteractionResult>
  respond(
    sessionKey: string,
    decision: PermissionDecision,
    fingerprint: string
  ): Promise<InteractionResult>
  peek(sessionKey: string): Promise<PeekResult>
  start(projectKey: string, provider: ProviderId): Promise<InteractionResult>
}
