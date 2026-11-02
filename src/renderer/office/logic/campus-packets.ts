import type { CampusSpoke } from './campus-geometry'
import { arcControl, type Vec3 } from './campus-motion'

// Arcs leave a room just above its plate edge and rise this far over the core.
export const ARC_ROOM_END_Y_M = 0.4
export const ARC_RISE_M = 3
// Road packets ride just above the asphalt.
const ROAD_PACKET_Y_M = 0.25

export interface PacketPath {
  kind: 'road' | 'arc'
  projectKey: string | null
  // A quadratic curve; a road's control point is its middle, so it runs straight.
  from: Vec3
  control: Vec3
  to: Vec3
}

// Every room sends packets two ways to the Brain: along its road, and up its arc to the core.
export function campusPacketPaths(spokes: readonly CampusSpoke[], core: Vec3): PacketPath[] {
  return spokes.flatMap((spoke) => {
    const roadFrom = { x: spoke.from.x, y: ROAD_PACKET_Y_M, z: spoke.from.z }
    const roadTo = { x: spoke.to.x, y: ROAD_PACKET_Y_M, z: spoke.to.z }
    const arcFrom = { x: spoke.from.x, y: ARC_ROOM_END_Y_M, z: spoke.from.z }
    return [
      {
        kind: 'road' as const,
        projectKey: spoke.projectKey,
        from: roadFrom,
        control: {
          x: (roadFrom.x + roadTo.x) / 2,
          y: ROAD_PACKET_Y_M,
          z: (roadFrom.z + roadTo.z) / 2
        },
        to: roadTo
      },
      {
        kind: 'arc' as const,
        projectKey: spoke.projectKey,
        from: arcFrom,
        control: arcControl(arcFrom, core, ARC_RISE_M),
        to: core
      }
    ]
  })
}
