import type { AgentView } from '../../shared/office/types'
import type { FloorLayout, LayoutMap } from './layout'
import { PathCache } from './navigation'
import type { Point } from './path'
import { streetPath } from './street-path'
import { bodiesShareElevation } from '../../shared/office/body-sweep'
import type { BodyFootprint } from '../../shared/office/body-footprints'

// dry-new: PathCache is planar; transfers retain surface and connector metadata per waypoint.
export interface FloorWaypoint extends Point {
  elevation?: number
  physicalFloorId?: string | null
  // The player's lift rides; agents never leave their floor.
  connectorId?: string
}

export function floorElevation(floor: FloorLayout): number {
  return 'elevation' in floor &&
    typeof floor.elevation === 'number' &&
    Number.isFinite(floor.elevation)
    ? floor.elevation
    : 0
}

function pointMetadata(candidate: unknown, fallback: Point): Point {
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    !('x' in candidate) ||
    !('z' in candidate)
  )
    return fallback
  return typeof candidate.x === 'number' &&
    Number.isFinite(candidate.x) &&
    typeof candidate.z === 'number' &&
    Number.isFinite(candidate.z)
    ? { x: candidate.x, z: candidate.z }
    : fallback
}

export function floorEntrance(floor: FloorLayout): Point {
  return pointMetadata('entrance' in floor ? floor.entrance : undefined, floor.elevator)
}

export class FloorRoutes {
  private groundFloors: readonly FloorLayout[] = []
  private streetBlocks: NonNullable<LayoutMap['streetBlocks']> = []
  private readonly floors = new Map<string, FloorLayout>()
  private readonly caches = new Map<string, { json: string; paths: PathCache }>()

  update(map: LayoutMap): void {
    const live = new Set(map.floors.map((floor) => floor.id))
    for (const id of this.floors.keys())
      if (!live.has(id)) {
        this.floors.delete(id)
        this.caches.delete(id)
      }
    this.streetBlocks = map.streetBlocks ?? []
    for (const floor of map.floors) {
      const json = JSON.stringify(floor)
      this.floors.set(floor.id, floor)
      if (this.caches.get(floor.id)?.json !== json)
        this.caches.set(floor.id, { json, paths: new PathCache(floor) })
    }
    this.groundFloors = [...this.floors.values()].filter((floor) => floorElevation(floor) === 0)
  }

  floor(id: string | null | undefined): FloorLayout | undefined {
    return id ? this.floors.get(id) : undefined
  }

  paths(id: string | null | undefined): PathCache | undefined {
    return id ? this.caches.get(id)?.paths : undefined
  }

  isStreetOpen(point: Point): boolean {
    return [...this.groundFloors.flatMap((floor) => floor.zones), ...this.streetBlocks].every(
      (block) =>
        Math.abs(point.x - block.x) >= block.width / 2 ||
        Math.abs(point.z - block.z) >= block.depth / 2
    )
  }

  aroundStreet(body: BodyFootprint, to: Point, obstacles: readonly BodyFootprint[]): Point[] {
    return streetPath({
      from: body,
      to,
      blocks: [
        ...this.groundFloors.flatMap((floor) => floor.zones),
        ...this.streetBlocks,
        ...obstacles
          .filter((obstacle) => obstacle.id !== body.id && bodiesShareElevation(body, obstacle))
          .map((obstacle) => ({
            x: obstacle.x,
            z: obstacle.z,
            width: obstacle.radius * 2,
            depth: obstacle.radius * 2
          }))
      ],
      clearance: body.radius + 0.02
    })
  }

  // Agents stay on their floor: a route exists only from a point on its path grid, and a
  // caller with none fades the agent across instead (CW-OFFICE-RETENTION).
  toFloor(view: AgentView, floor: FloorLayout, to: Point): FloorWaypoint[] {
    const paths = this.paths(floor.id)
    if (
      view.physicalFloorId !== floor.id ||
      (view.elevation ?? 0) !== floorElevation(floor) ||
      !paths?.contains(view)
    )
      return []
    return paths.get(view, to).map((point) => ({
      ...point,
      elevation: floorElevation(floor),
      physicalFloorId: floor.id
    }))
  }
}
