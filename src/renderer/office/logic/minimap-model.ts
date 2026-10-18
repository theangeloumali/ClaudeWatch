import { parseAgentKey } from '../../../shared/office/agent-key'
import { floorEnvelope, physicalFloorId } from '../scene/all-floor-model'
import type { FloorGeometry, OfficeFrame } from '../scene-model'
import { boundsOfZone, type Bounds } from './zone-framing'

interface MinimapPlayer {
  x: number
  z: number
  physicalFloorId: string | null
}

export interface MinimapInput {
  frame: OfficeFrame
  viewMode: 'city' | 'office'
  focusedFloorId: string | null
  focusedRoomId: string | null
  selectedAgentKey: string | null
  isPreview: boolean
  player?: MinimapPlayer
}

interface MinimapFootprint {
  id: string
  label: string
  bounds: Bounds
  isSelected: boolean
}

interface MinimapFloor extends Omit<MinimapFootprint, 'id'> {
  floorId: string
}

interface MinimapWorker extends MinimapPlayer {
  agentKey: string
  label: string
  isSelected: boolean
}

export interface MinimapModel {
  bounds: Bounds | null
  floors: MinimapFloor[]
  rooms: MinimapFootprint[]
  workers: MinimapWorker[]
  player: MinimapPlayer | null
}

// dry-new: camera framing projects isometrically; this composes a north-up, world-metre map.
export function buildMinimapModel(input: MinimapInput): MinimapModel {
  const represented = input.frame.floors.filter(
    (floor) =>
      validBounds(floor) !== null &&
      (input.viewMode === 'city' || floor.floorId === input.focusedFloorId)
  )
  const envelope = floorEnvelope(represented)
  const bounds = envelope && validBounds(envelope)
  if (!bounds) return { bounds: null, floors: [], rooms: [], workers: [], player: null }
  const floors = represented.flatMap((floor) => {
    const footprint = validBounds(floor)
    if (!footprint) return []
    return [
      {
        floorId: floor.floorId,
        label: floor.label.trim() || floor.floorId,
        bounds: footprint,
        isSelected: floor.floorId === input.focusedFloorId
      }
    ]
  })
  const rooms =
    input.viewMode === 'city'
      ? []
      : represented.flatMap((floor) => {
          return floor.rooms.flatMap((room) => {
            const footprint = validBounds(room)
            if (!footprint || !containsRectangle(bounds, footprint)) return []
            return [
              {
                id: room.id,
                label: room.label.trim() || room.id,
                bounds: footprint,
                isSelected: room.id === input.focusedRoomId
              }
            ]
          })
        })
  const surface = { floors, bounds, viewMode: input.viewMode }
  return {
    bounds,
    floors,
    rooms,
    workers: input.isPreview ? [] : currentWorkers(input, surface),
    player: currentPlayer(input, surface)
  }
}

interface RepresentedSurface {
  floors: MinimapFloor[]
  bounds: Bounds
  viewMode: MinimapInput['viewMode']
}

function currentWorkers(input: MinimapInput, surface: RepresentedSurface): MinimapWorker[] {
  const seen = new Set<string>()
  return input.frame.agents.flatMap((agent) => {
    const identity = parseAgentKey(agent.agentKey, input.frame.sessions)
    const position = { x: agent.x, z: agent.z, physicalFloorId: physicalFloorId(agent) }
    if (!identity || seen.has(agent.agentKey) || !representsSurface(position, surface)) return []
    seen.add(agent.agentKey)
    return [
      {
        ...position,
        agentKey: agent.agentKey,
        label:
          identity.member?.name?.trim() ||
          identity.member?.type.trim() ||
          identity.session.name.trim() ||
          agent.agentKey,
        isSelected: agent.agentKey === input.selectedAgentKey
      }
    ]
  })
}

function currentPlayer(input: MinimapInput, surface: RepresentedSurface): MinimapPlayer | null {
  const player = input.player
  if (!player || input.isPreview || !representsSurface(player, surface)) return null
  // Null is street/transit, never permission to reuse the player's home floor.
  if (
    player.physicalFloorId === null &&
    surface.floors.some((floor) => containsPoint(floor.bounds, player))
  )
    return null
  return { ...player }
}

function representsSurface(marker: MinimapPlayer, surface: RepresentedSurface): boolean {
  if (!containsPoint(surface.bounds, marker)) return false
  if (marker.physicalFloorId === null) return surface.viewMode === 'city'
  const floor = surface.floors.find((candidate) => candidate.floorId === marker.physicalFloorId)
  return Boolean(floor && containsPoint(floor.bounds, marker))
}

function validBounds(shape: Pick<FloorGeometry, 'x' | 'z' | 'width' | 'depth'>): Bounds | null {
  if (![shape.x, shape.z, shape.width, shape.depth].every(Number.isFinite)) return null
  if (shape.width <= 0 || shape.depth <= 0) return null
  const bounds = boundsOfZone(shape)
  const spans = [bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ]
  const isValid =
    Object.values(bounds).every(Number.isFinite) &&
    spans.every((span) => Number.isFinite(span) && span > 0)
  return isValid ? bounds : null
}

function containsPoint(bounds: Bounds, point: Pick<MinimapPlayer, 'x' | 'z'>): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.z) &&
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.z >= bounds.minZ &&
    point.z <= bounds.maxZ
  )
}

function containsRectangle(outer: Bounds, inner: Bounds): boolean {
  return (
    containsPoint(outer, { x: inner.minX, z: inner.minZ }) &&
    containsPoint(outer, { x: inner.maxX, z: inner.maxZ })
  )
}
