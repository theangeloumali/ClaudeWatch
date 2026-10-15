import type { FloorGeometry } from '../scene-model'
import { boundsOfZone } from '../logic/zone-framing'
import { roomWallSegments, SIDE_NORMAL } from '../logic/room-layout'
import { floorConnector, floorElevation, PHYSICAL_STOREY_HEIGHT } from './all-floor-model'
import type { BuildingExteriorProfile } from '../themes/physical-building-parts'

// dry-new: theme slabs have no full-height, non-occluding perimeter glazing or physical lift shaft.
export interface WindowPart {
  kind: 'frame' | 'glass' | 'band'
  side: 'north' | 'east' | 'south' | 'west' | 'connector'
  position: [number, number, number]
  size: [number, number, number]
}

const BAY_WIDTH = 4
const MAX_BAYS_PER_SIDE = 32
const FRAME_WIDTH = 0.1
const SILL_HEIGHT = 1.05
const GLASS_HEIGHT = 3.2

export function windowParts(
  floor: FloorGeometry,
  maxBaysPerSide = MAX_BAYS_PER_SIDE,
  profile?: BuildingExteriorProfile
): WindowPart[] {
  const bounds = boundsOfZone(floor)
  const y = floorElevation(floor)
  const parts: WindowPart[] = []
  const bayWidth = profile?.bayWidth ?? BAY_WIDTH
  const frameWidth = profile?.frameWidth ?? FRAME_WIDTH
  const sillHeight = profile?.sillHeight ?? SILL_HEIGHT
  const glassHeight = profile?.glassHeight ?? GLASS_HEIGHT
  const facadeDepth = profile?.facadeDepth ?? FRAME_WIDTH
  const sides = [
    { side: 'north', length: floor.width, x: floor.x, z: bounds.minZ, acrossX: true },
    { side: 'south', length: floor.width, x: floor.x, z: bounds.maxZ, acrossX: true },
    { side: 'east', length: floor.depth, x: bounds.maxX, z: floor.z, acrossX: false },
    { side: 'west', length: floor.depth, x: bounds.minX, z: floor.z, acrossX: false }
  ] as const
  for (const edge of sides) {
    const bays = Math.max(
      1,
      Math.min(MAX_BAYS_PER_SIDE, maxBaysPerSide, Math.ceil(edge.length / bayWidth))
    )
    const weights = Array.from({ length: bays }, (_, index) =>
      profile?.silhouette === 'stepped'
        ? index % 3 === 0
          ? 1.4
          : 0.8
        : profile?.silhouette === 'service-ribs'
          ? index % 2 === 0
            ? 0.8
            : 1.2
          : 1
    )
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
    let offset = -edge.length / 2
    const size = (width: number, height: number): [number, number, number] =>
      edge.acrossX ? [width, height, facadeDepth] : [facadeDepth, height, width]
    for (let index = 0; index < bays; index++) {
      const span = (edge.length * (weights[index] ?? 1)) / totalWeight
      const center = offset + span / 2
      const x = edge.x + (edge.acrossX ? center : 0)
      const z = edge.z + (edge.acrossX ? 0 : center)
      parts.push({
        kind: 'glass',
        side: edge.side,
        position: [x, y + sillHeight + glassHeight / 2, z],
        size: size(Math.max(span * 0.2, span - frameWidth), glassHeight)
      })
      parts.push({
        kind: 'band',
        side: edge.side,
        position: [x, y + sillHeight / 2, z],
        size: size(span, sillHeight)
      })
      parts.push({
        kind: 'frame',
        side: edge.side,
        position: [
          edge.x + (edge.acrossX ? offset : 0),
          y + PHYSICAL_STOREY_HEIGHT / 2,
          edge.z + (edge.acrossX ? 0 : offset)
        ],
        size: edge.acrossX
          ? [frameWidth, PHYSICAL_STOREY_HEIGHT, facadeDepth]
          : [facadeDepth, PHYSICAL_STOREY_HEIGHT, frameWidth]
      })
      offset += span
    }
    parts.push({
      kind: 'frame',
      side: edge.side,
      position: [
        edge.x + (edge.acrossX ? edge.length / 2 : 0),
        y + PHYSICAL_STOREY_HEIGHT / 2,
        edge.z + (edge.acrossX ? 0 : edge.length / 2)
      ],
      size: edge.acrossX
        ? [frameWidth, PHYSICAL_STOREY_HEIGHT, facadeDepth]
        : [facadeDepth, PHYSICAL_STOREY_HEIGHT, frameWidth]
    })
    if (profile?.silhouette === 'split-lantern' || profile?.silhouette === 'offset-canopy')
      parts.push({
        kind: 'frame',
        side: edge.side,
        position: [
          edge.x,
          y + sillHeight + glassHeight * (profile.silhouette === 'split-lantern' ? 0.55 : 0.82),
          edge.z
        ],
        size: size(edge.length, frameWidth * 1.5)
      })
    parts.push({
      kind: 'band',
      side: edge.side,
      position: [edge.x, y + (sillHeight + glassHeight + PHYSICAL_STOREY_HEIGHT) / 2, edge.z],
      size: size(edge.length, PHYSICAL_STOREY_HEIGHT - sillHeight - glassHeight)
    })
    parts.push({
      kind: 'frame',
      side: edge.side,
      position: [edge.x, y + PHYSICAL_STOREY_HEIGHT - frameWidth, edge.z],
      size: size(edge.length, frameWidth)
    })
  }
  const connector = floorConnector(floor)
  for (const x of [-0.8, 0.8])
    for (const z of [-0.8, 0.8]) {
      parts.push({
        kind: 'frame',
        side: 'connector',
        position: [connector.x + x, y + PHYSICAL_STOREY_HEIGHT / 2, connector.z + z],
        size: [FRAME_WIDTH, PHYSICAL_STOREY_HEIGHT, FRAME_WIDTH]
      })
    }
  if (!profile || profile.entranceFloorId !== floor.floorId) return parts
  const entrance = floor.entrance ?? { x: floor.x, z: floor.z + floor.depth / 2 }
  const perimeter = roomWallSegments(
    { ...floor, id: floor.floorId, door: entrance },
    profile.entranceWidth + profile.frameWidth * 2
  )
  // Reuse the real door's wall segments so facade bays cannot close the approach corridor.
  return parts.flatMap((part): WindowPart[] => {
    if (part.side === 'connector' || part.position[1] - part.size[1] / 2 >= y + 3.3) return [part]
    const normal = SIDE_NORMAL[part.side]
    const isAlongX = normal.z !== 0
    const center = isAlongX ? part.position[0] : part.position[2]
    const width = isAlongX ? part.size[0] : part.size[2]
    return perimeter
      .filter((segment) => segment.normalX === normal.x && segment.normalZ === normal.z)
      .flatMap((segment): WindowPart[] => {
        const segmentCenter = isAlongX ? segment.x : segment.z
        const start = Math.max(center - width / 2, segmentCenter - segment.length / 2)
        const end = Math.min(center + width / 2, segmentCenter + segment.length / 2)
        if (end <= start) return []
        const middle = (start + end) / 2
        return [
          {
            ...part,
            position: isAlongX
              ? [middle, part.position[1], part.position[2]]
              : [part.position[0], part.position[1], middle],
            size: isAlongX
              ? [end - start, part.size[1], part.size[2]]
              : [part.size[0], part.size[1], end - start]
          }
        ]
      })
  })
}
