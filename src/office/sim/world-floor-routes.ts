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

export class FloorRoutes {
  private readonly caches = new Map<string, { json: string; paths: PathCache }>()

  // Whether any floor came, went or changed.
  update(map: LayoutMap): boolean {
    const live = new Set(map.floors.map((floor) => floor.id))
    let hasChanged = false
    for (const id of this.caches.keys()) if (!live.has(id)) hasChanged = this.caches.delete(id)
    for (const floor of map.floors) {
      const json = JSON.stringify(floor)
      if (this.caches.get(floor.id)?.json === json) continue
      this.caches.set(floor.id, { json, paths: new PathCache(floor) })
      hasChanged = true
    }
    return hasChanged
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
