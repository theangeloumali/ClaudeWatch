import type { AgentView } from '../../../shared/office/types'
import type { FloorGeometry } from '../scene-model'
import { boundsOfZone } from '../logic/zone-framing'

// dry-new: selectors compose supplied physical floors; they never advance or invent actors.
export const PHYSICAL_STOREY_HEIGHT = 5.5

export function floorElevation(floor: FloorGeometry): number {
  return 'elevation' in floor &&
    typeof floor.elevation === 'number' &&
    Number.isFinite(floor.elevation)
    ? floor.elevation
    : 0
}

export function agentElevation(agent: AgentView): number {
  return 'elevation' in agent &&
    typeof agent.elevation === 'number' &&
    Number.isFinite(agent.elevation)
    ? agent.elevation
    : 0
}

export function physicalFloorId(agent: AgentView): string | null {
  if ('physicalFloorId' in agent)
    return typeof agent.physicalFloorId === 'string' ? agent.physicalFloorId : null
  return agent.floorId
}

export function floorConnector(floor: FloorGeometry): { x: number; z: number } {
  const connector = 'connector' in floor ? floor.connector : undefined
  if (
    connector &&
    typeof connector === 'object' &&
    'x' in connector &&
    'z' in connector &&
    typeof connector.x === 'number' &&
    typeof connector.z === 'number' &&
    Number.isFinite(connector.x) &&
    Number.isFinite(connector.z)
  )
    return { x: connector.x, z: connector.z }
  return floor.elevator
}

export function floorEnvelope(floors: readonly FloorGeometry[]) {
  if (!floors.length) return null
  const bounds = floors.map(boundsOfZone)
  const minX = Math.min(...bounds.map((bound) => bound.minX))
  const maxX = Math.max(...bounds.map((bound) => bound.maxX))
  const minZ = Math.min(...bounds.map((bound) => bound.minZ))
  const maxZ = Math.max(...bounds.map((bound) => bound.maxZ))
  return {
    x: (minX + maxX) / 2,
    z: (minZ + maxZ) / 2,
    width: maxX - minX,
    depth: maxZ - minZ,
    minY: Math.min(...floors.map(floorElevation)),
    maxY: Math.max(...floors.map((floor) => floorElevation(floor) + PHYSICAL_STOREY_HEIGHT))
  }
}

export function groundEnvelope(
  floors: readonly FloorGeometry[],
  fallback: FloorGeometry
): FloorGeometry {
  const envelope = floorEnvelope(floors)
  return envelope
    ? {
        ...fallback,
        ...envelope,
        elevation: envelope.minY,
        rooms: floors.flatMap((floor) => floor.rooms),
        zones: floors.flatMap((floor) => floor.zones)
      }
    : fallback
}

export function partitionPhysicalAgents(
  floors: readonly FloorGeometry[],
  agents: readonly AgentView[]
) {
  const byFloor = new Map<string, AgentView[]>(floors.map((floor) => [floor.floorId, []]))
  const transit: AgentView[] = []
  const seen = new Set<string>()
  for (const agent of agents) {
    if (seen.has(agent.agentKey)) continue
    seen.add(agent.agentKey)
    const presence = physicalFloorId(agent)
    const crew = presence === null ? undefined : byFloor.get(presence)
    if (crew) crew.push(agent)
    else transit.push(agent)
  }
  return { byFloor, transit }
}

export function floorForAgent(options: {
  agent: AgentView
  floors?: readonly FloorGeometry[]
  fallback: FloorGeometry
  purpose: 'home' | 'presence'
}): FloorGeometry {
  const id = options.purpose === 'home' ? options.agent.floorId : physicalFloorId(options.agent)
  return options.floors?.find((floor) => floor.floorId === id) ?? options.fallback
}
