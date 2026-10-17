import type { AgentView } from '../../shared/office/types'
import type { FloorLayout, LayoutMap } from './layout'
import { PathCache } from './navigation'
import type { Point } from './path'

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
  private readonly floors = new Map<string, FloorLayout>()
  private readonly caches = new Map<string, { json: string; paths: PathCache }>()

  update(map: LayoutMap): void {
    const live = new Set(map.floors.map((floor) => floor.id))
    for (const id of this.floors.keys())
      if (!live.has(id)) {
        this.floors.delete(id)
        this.caches.delete(id)
      }
    for (const floor of map.floors) {
      const json = JSON.stringify(floor)
      this.floors.set(floor.id, floor)
      if (this.caches.get(floor.id)?.json !== json)
        this.caches.set(floor.id, { json, paths: new PathCache(floor) })
    }
  }

  floor(id: string | null | undefined): FloorLayout | undefined {
    return id ? this.floors.get(id) : undefined
  }

  paths(id: string | null | undefined): PathCache | undefined {
    return id ? this.caches.get(id)?.paths : undefined
  }

  // Agents stay on their floor: a route exists only from a point on its path grid, and a
  // caller with none fades the agent across instead (CW-OFFICE-RETENTION).
  toFloor(view: AgentView, floor: FloorLayout, to: Point): Point[] {
    const paths = this.paths(floor.id)
    if (
      view.physicalFloorId !== floor.id ||
      (view.elevation ?? 0) !== floorElevation(floor) ||
      !paths?.contains(view)
    )
      return []
    return paths.get(view, to)
  }
}
