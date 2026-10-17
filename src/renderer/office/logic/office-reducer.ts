import type { OfficeFrame } from '../scene-model'
import { buildAttentionQueue, nextAttentionKey } from './attention-queue'
import type { ZoomDirection } from './camera-bands'
import { mainAgentForSession, sessionForAgent } from './floor-model'
import type { WallsMode } from './room-layout'
import { findZone } from './zone-model'
import { workstationSeat } from './workstation-framing'
import { physicalFloorId } from '../scene/all-floor-model'

// `nonce` makes a repeated request (fly to the same agent twice) still fire the camera effect.
export type CameraRequest =
  | { kind: 'fly'; agentKey: string; nonce: number }
  | { kind: 'rotate'; direction: -1 | 1; nonce: number }
  | { kind: 'tilt'; direction: -1 | 1; nonce: number }
  | { kind: 'zoom'; direction: ZoomDirection; nonce: number }
  | { kind: 'zone'; zoneId: string; nonce: number }
  | { kind: 'fit'; nonce: number }
  | { kind: 'reset'; nonce: number }
  | { kind: 'office'; nonce: number }
  | { kind: 'workstation'; agentKey: string; nonce: number }
  | { kind: 'city'; nonce: number }
  | { kind: 'player'; position: { x: number; z: number }; nonce: number }

export interface OfficeState {
  frame: OfficeFrame | null
  focusedFloorId: string | null
  selectedAgentKey: string | null
  // The company or project zone the camera last flew to; the Offices panel marks it current.
  focusedZoneId: string | null
  // The session whose permission prompt is open for review in the inspector.
  reviewingSessionKey: string | null
  wallsMode: WallsMode
  areRoofsVisible: boolean
  isListView: boolean
  isMetricsVisible: boolean
  viewMode: 'office' | 'city'
  // The owner is moving their own character: the arrow keys and clicks walk it instead of the camera.
  isWalking: boolean
  isCameraManuallyOwned: boolean
  cameraRequest: CameraRequest | null
  // A clear view for recordings; not saved, so a restart shows the panels again.
  arePanelsHidden: boolean
}

export type OfficeAction =
  | { type: 'floor-focused'; floorId: string }
  | { type: 'floor-flown'; floorId: string; zoneId?: string }
  | { type: 'floor-opened'; floorId: string }
  | { type: 'frame-received'; frame: OfficeFrame }
  | { type: 'zone-flown'; zoneId: string }
  | { type: 'company-numbered'; number: number }
  | { type: 'agent-selected'; agentKey: string | null }
  | { type: 'agent-flown'; agentKey: string }
  | { type: 'session-opened'; sessionKey: string }
  | { type: 'review-opened'; sessionKey: string }
  | { type: 'review-closed' }
  | { type: 'next-attention' }
  | { type: 'fly-to-selected' }
  | { type: 'camera-rotated'; direction: -1 | 1 }
  | { type: 'camera-tilted'; direction: -1 | 1 }
  | { type: 'camera-zoomed'; direction: ZoomDirection }
  | { type: 'camera-fit' }
  | { type: 'camera-reset' }
  | { type: 'camera-workstation' }
  | { type: 'camera-manually-moved' }
  | { type: 'camera-player'; position: { x: number; z: number } }
  | { type: 'view-set'; view: OfficeState['viewMode'] }
  | { type: 'walls-set'; mode: WallsMode }
  | { type: 'roofs-toggled' }
  | { type: 'list-toggled' }
  | { type: 'metrics-toggled' }
  | { type: 'panels-toggled' }
  | { type: 'walk-toggled' }
  | { type: 'zone-walked'; zoneId: string }

export const INITIAL_OFFICE_STATE: OfficeState = {
  frame: null,
  focusedFloorId: null,
  selectedAgentKey: null,
  focusedZoneId: null,
  reviewingSessionKey: null,
  wallsMode: 'cutaway',
  areRoofsVisible: true,
  isListView: false,
  isMetricsVisible: false,
  viewMode: 'city',
  isWalking: false,
  isCameraManuallyOwned: false,
  cameraRequest: null,
  arePanelsHidden: false
}

function nextNonce(state: OfficeState): number {
  return (state.cameraRequest?.nonce ?? 0) + 1
}

function defaultFloorId(frame: OfficeFrame): string | null {
  const [head] = buildAttentionQueue(frame.sessions)
  const waiting = head ? mainAgentForSession(frame, head.sessionKey) : undefined
  return waiting?.floorId ?? frame.floors[0]?.floorId ?? null
}

function flyTo(state: OfficeState, agentKey: string): OfficeState {
  const agent = state.frame?.agents.find((candidate) => candidate.agentKey === agentKey)
  if (!agent) return state
  return {
    ...state,
    focusedFloorId: physicalFloorId(agent) ?? agent.floorId,
    selectedAgentKey: agentKey,
    viewMode: 'office',
    isCameraManuallyOwned: false,
    cameraRequest: { kind: 'fly', agentKey, nonce: nextNonce(state) }
  }
}

function receiveFrame(state: OfficeState, frame: OfficeFrame): OfficeState {
  const hasFocusedFloor = frame.floors.some((floor) => floor.floorId === state.focusedFloorId)
  const hasSelectedAgent = frame.agents.some((agent) => agent.agentKey === state.selectedAgentKey)
  return {
    ...state,
    frame,
    focusedFloorId: hasFocusedFloor ? state.focusedFloorId : defaultFloorId(frame),
    selectedAgentKey: hasSelectedAgent ? state.selectedAgentKey : null
  }
}

function openNextAttention(state: OfficeState): OfficeState {
  if (!state.frame) return state
  const selected = state.frame.agents.find((agent) => agent.agentKey === state.selectedAgentKey)
  const currentSessionKey = selected ? (sessionForAgent(state.frame, selected)?.key ?? null) : null
  const nextKey = nextAttentionKey(buildAttentionQueue(state.frame.sessions), currentSessionKey)
  const agent = nextKey ? mainAgentForSession(state.frame, nextKey) : undefined
  return agent ? flyTo(state, agent.agentKey) : state
}

function flyToZone(state: OfficeState, zoneId: string | undefined): OfficeState {
  if (!zoneId) return state
  return {
    ...state,
    focusedFloorId:
      state.frame?.floors.find(
        (floor) => findZone(floor, zoneId) || floor.rooms.some((room) => room.id === zoneId)
      )?.floorId ?? state.focusedFloorId,
    focusedZoneId: zoneId,
    viewMode: 'office',
    isWalking: false,
    isCameraManuallyOwned: false,
    cameraRequest: { kind: 'zone', zoneId, nonce: nextNonce(state) }
  }
}

// Number keys jump to companies in floor order (1 = first company zone).
function companyZoneAt(state: OfficeState, number: number): string | undefined {
  const companies = (state.frame?.floors ?? [])
    .flatMap((floor) => floor.zones)
    .filter((zone) => zone.kind === 'company')
  return companies[number - 1]?.id
}

export function officeReducer(state: OfficeState, action: OfficeAction): OfficeState {
  switch (action.type) {
    case 'frame-received':
      return receiveFrame(state, action.frame)
    case 'floor-flown':
      return state.frame?.floors.some((floor) => floor.floorId === action.floorId)
        ? {
            ...state,
            focusedFloorId: action.floorId,
            focusedZoneId: action.zoneId ?? null,
            selectedAgentKey: null,
            reviewingSessionKey: null,
            viewMode: 'office',
            isWalking: false,
            isCameraManuallyOwned: false,
            cameraRequest: { kind: 'office', nonce: nextNonce(state) }
          }
        : state
    case 'floor-focused':
    case 'floor-opened':
      return state.frame?.floors.some((floor) => floor.floorId === action.floorId)
        ? {
            ...state,
            focusedFloorId: action.floorId,
            focusedZoneId: null,
            selectedAgentKey: null,
            reviewingSessionKey: null,
            viewMode:
              action.type === 'floor-opened' || !state.isCameraManuallyOwned
                ? 'office'
                : state.viewMode,
            // A floor highlight must not take the camera back from a manual pan or zoom.
            cameraRequest: state.isCameraManuallyOwned
              ? state.cameraRequest
              : { kind: 'reset', nonce: nextNonce(state) }
          }
        : state
    case 'zone-flown':
      return flyToZone(state, action.zoneId)
    case 'company-numbered':
      return flyToZone(state, companyZoneAt(state, action.number))
    case 'agent-selected': {
      const selected = state.frame?.agents.find((agent) => agent.agentKey === action.agentKey)
      return {
        ...state,
        focusedFloorId: selected
          ? (physicalFloorId(selected) ?? selected.floorId)
          : state.focusedFloorId,
        selectedAgentKey: action.agentKey,
        reviewingSessionKey:
          action.agentKey === state.selectedAgentKey ? state.reviewingSessionKey : null
      }
    }
    case 'agent-flown':
      return flyTo(state, action.agentKey)
    case 'session-opened': {
      const agent = state.frame ? mainAgentForSession(state.frame, action.sessionKey) : undefined
      return agent ? flyTo(state, agent.agentKey) : state
    }
    case 'review-opened': {
      const agent = state.frame ? mainAgentForSession(state.frame, action.sessionKey) : undefined
      return agent
        ? { ...flyTo(state, agent.agentKey), reviewingSessionKey: action.sessionKey }
        : state
    }
    case 'review-closed':
      return { ...state, reviewingSessionKey: null }
    case 'next-attention':
      return openNextAttention(state)
    case 'fly-to-selected':
      return state.selectedAgentKey ? flyTo(state, state.selectedAgentKey) : state
    case 'camera-rotated':
      return {
        ...state,
        isCameraManuallyOwned: true,
        cameraRequest: { kind: 'rotate', direction: action.direction, nonce: nextNonce(state) }
      }
    case 'camera-tilted':
      return {
        ...state,
        isCameraManuallyOwned: true,
        cameraRequest: { kind: 'tilt', direction: action.direction, nonce: nextNonce(state) }
      }
    case 'camera-zoomed':
      return {
        ...state,
        isCameraManuallyOwned: true,
        cameraRequest: { kind: 'zoom', direction: action.direction, nonce: nextNonce(state) }
      }
    case 'camera-fit':
      return {
        ...state,
        isWalking: false,
        isCameraManuallyOwned: false,
        cameraRequest: { kind: 'fit', nonce: nextNonce(state) }
      }
    case 'camera-reset':
      return {
        ...state,
        focusedZoneId: null,
        viewMode: 'office',
        isWalking: false,
        isCameraManuallyOwned: false,
        cameraRequest: { kind: 'reset', nonce: nextNonce(state) }
      }
    case 'camera-manually-moved':
      return state.isCameraManuallyOwned ? state : { ...state, isCameraManuallyOwned: true }
    case 'camera-player':
      return {
        ...state,
        isCameraManuallyOwned: false,
        cameraRequest: { kind: 'player', position: action.position, nonce: nextNonce(state) }
      }
    case 'camera-workstation': {
      const agent = state.frame?.agents.find(
        (candidate) => candidate.agentKey === state.selectedAgentKey
      )
      const floor = state.frame?.floors.find((candidate) => candidate.floorId === agent?.floorId)
      if (!agent || !floor || !workstationSeat(agent, floor)) return state
      return {
        ...state,
        focusedFloorId: agent.floorId,
        viewMode: 'office',
        isWalking: false,
        isCameraManuallyOwned: false,
        cameraRequest: { kind: 'workstation', agentKey: agent.agentKey, nonce: nextNonce(state) }
      }
    }
    case 'view-set': {
      const next = {
        ...state,
        viewMode: action.view,
        isWalking: false,
        isCameraManuallyOwned: false
      }
      if (action.view === 'city')
        return { ...next, cameraRequest: { kind: 'city', nonce: nextNonce(state) } }
      const floor = state.frame?.floors.find((entry) => entry.floorId === state.focusedFloorId)
      if (floor && state.focusedZoneId && findZone(floor, state.focusedZoneId))
        return { ...next, cameraRequest: { kind: 'office', nonce: nextNonce(state) } }
      return {
        ...next,
        focusedZoneId: null,
        cameraRequest: { kind: 'office', nonce: nextNonce(state) }
      }
    }
    case 'walls-set':
      return { ...state, wallsMode: action.mode }
    case 'roofs-toggled':
      return { ...state, areRoofsVisible: !state.areRoofsVisible }
    case 'list-toggled':
      return { ...state, isListView: !state.isListView }
    case 'metrics-toggled':
      return { ...state, isMetricsVisible: !state.isMetricsVisible }
    case 'panels-toggled':
      return { ...state, arePanelsHidden: !state.arePanelsHidden }
    case 'walk-toggled':
      return { ...state, isWalking: !state.isWalking, isCameraManuallyOwned: false }
    // The camera goes with the player, so the office is marked current without a flight.
    case 'zone-walked':
      return { ...state, focusedZoneId: action.zoneId }
    default: {
      const unreachable: never = action
      return unreachable
    }
  }
}
