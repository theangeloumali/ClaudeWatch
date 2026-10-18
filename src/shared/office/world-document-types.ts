import type { LayoutMap } from '../../office/sim/layout'
import type { SessionRef } from './types'

// dry-new: LayoutMap contains live simulation state; this DTO persists only identity and presentation.
export interface WorldPoint {
  x: number
  z: number
}
export interface WorldSize {
  width: number
  depth: number
}
export interface WorldFootprint extends WorldPoint, WorldSize {}
export interface WorldDesk extends WorldPoint {
  id: string
  heading: number
}
export interface WorldBuilding {
  id: string
  companyKey: string
  projectKey: string
  displayName: string
  footprint: WorldFootprint
  floors: number
  entrance: WorldPoint
  connector?: WorldFootprint
  themeId?: string
}
export type WorldRoomTarget = `session:${string}` | `team:${string}:${string}`
// Positions are building-local; doors and desks are room-local, all in metres.
export interface WorldRoom {
  id: string
  target: WorldRoomTarget
  buildingId: string
  floorNumber: number
  position: WorldPoint
  size: WorldSize
  door: WorldPoint
  desks: WorldDesk[]
  displayName?: string
  themeId?: string
}
export interface WorldVenue {
  id: string
  kind: 'arcade' | 'lounge' | 'market' | 'garage' | 'transit'
  footprint: WorldFootprint
  entrance: WorldPoint
  slots: WorldDesk[]
  capacity: number
  displayName?: string
  themeId?: string
}
type WorldReservation = LayoutMap['reservations'][string] & { sessionKey: string }
interface WorldAllocationOrder {
  companyKey: string
  projectKey?: string
  index: number
}
export interface WorldAllocation {
  reservations: WorldReservation[]
  order: WorldAllocationOrder[]
}
export interface WorldDocument {
  version: 2
  revision: number
  buildings: WorldBuilding[]
  rooms: WorldRoom[]
  venues: WorldVenue[]
  allocation?: WorldAllocation
}
export type WorldValidationReason =
  | 'invalid-shape'
  | 'unsupported-version'
  | 'limit'
  | 'duplicate'
  | 'unknown-building'
  | 'unknown-floor'
  | 'unknown-theme'
  | 'identity-binding'
  | 'overlap'
  | 'outside-building'
  | 'blocked-entrance'
  | 'blocked-connector'
  | 'invalid-door'
  | 'desk-clearance'
  | 'desk-unreachable'
  | 'occupied-capacity'
  | 'transfer-connector'
export interface WorldValidationError {
  field: string
  target: string
  reason: WorldValidationReason
}
export type WorldDocumentParseResult =
  | { success: true; document: WorldDocument }
  | { success: false; errors: WorldValidationError[] }
export interface WorldValidationContext {
  layout: LayoutMap
  sessions: readonly SessionRef[]
  knownThemeIds?: readonly string[]
}
