import { SIDEWALK_M, type TownRoad } from './town-roads'
import type { WorldPoint } from './world-document-types'

export const CROSSWALK_DEPTH_M = 3
// From the cross street's kerb line to the near edge of its zebra, and from the zebra's far
// edge to the stop line.
const ZEBRA_SETBACK_M = 0.7

export interface RoadCrossing {
  roadId: string
  // Along the crossed road, at the other road's centre line.
  position: number
  halfWidth: number
}

export interface Crosswalk {
  id: string
  // The road the zebra is painted across.
  roadId: string
  centre: WorldPoint
  // The axis a walker crosses along: across the road.
  axis: 'x' | 'z'
  // Kerb to kerb, from the centre.
  halfLength: number
  // Where traffic holds for it: [heading for the junction, leaving it], each in its own lane.
  stopLines: [WorldPoint, WorldPoint]
}

const isAlongX = (road: TownRoad): boolean => road.from.z === road.to.z

// Every road that meets or crosses `road` inside its stretch, access-lane mouths included.
export function roadCrossings(road: TownRoad, roads: readonly TownRoad[]): RoadCrossing[] {
  const alongX = isAlongX(road)
  const from = alongX ? road.from.x : road.from.z
  const to = alongX ? road.to.x : road.to.z
  const fixed = alongX ? road.from.z : road.from.x
  return roads.flatMap((other) => {
    if (isAlongX(other) === alongX) return []
    const position = alongX ? other.from.x : other.from.z
    const low = alongX ? Math.min(other.from.z, other.to.z) : Math.min(other.from.x, other.to.x)
    const high = alongX ? Math.max(other.from.z, other.to.z) : Math.max(other.from.x, other.to.x)
    return position >= Math.min(from, to) &&
      position <= Math.max(from, to) &&
      fixed >= low &&
      fixed <= high
      ? [{ roadId: other.id, position, halfWidth: other.width / 2 }]
      : []
  })
}

// A zebra just past each side of every crossing, unless its band would pass the road's end.
// Town paint, stop lines and the sidewalk network's crossing edges all read this (citizens-4).
export function crosswalks(roads: readonly TownRoad[]): Crosswalk[] {
  return roads.flatMap((road) => {
    if (road.class === 'lane') return []
    const alongX = isAlongX(road)
    const start = alongX ? Math.min(road.from.x, road.to.x) : Math.min(road.from.z, road.to.z)
    const end = alongX ? Math.max(road.from.x, road.to.x) : Math.max(road.from.z, road.to.z)
    const fixed = alongX ? road.from.z : road.from.x
    const halfLength = road.width / 2 - SIDEWALK_M[road.class]
    const at = (along: number, across: number): WorldPoint =>
      alongX ? { x: along, z: fixed + across } : { x: fixed + across, z: along }
    return roadCrossings(road, roads).flatMap((crossing) =>
      ([-1, 1] as const).flatMap((side): Crosswalk[] => {
        const centre =
          crossing.position + side * (crossing.halfWidth + CROSSWALK_DEPTH_M / 2 + ZEBRA_SETBACK_M)
        if (centre - CROSSWALK_DEPTH_M / 2 < start || centre + CROSSWALK_DEPTH_M / 2 > end)
          return []
        // Keep-left: traffic heading for the junction from this side holds on this lane.
        const approachLane = ((side * halfLength) / 2) * (alongX ? 1 : -1)
        return [
          {
            id: `crosswalk:${road.id}:${crossing.roadId}:${side}`,
            roadId: road.id,
            centre: at(centre, 0),
            axis: alongX ? 'z' : 'x',
            halfLength,
            stopLines: [
              at(
                crossing.position +
                  side * (crossing.halfWidth + CROSSWALK_DEPTH_M + 2 * ZEBRA_SETBACK_M),
                approachLane
              ),
              at(crossing.position + side * crossing.halfWidth, -approachLane)
            ]
          }
        ]
      })
    )
  })
}
