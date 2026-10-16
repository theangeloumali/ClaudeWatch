import type { AgentView } from '../../shared/office/types'
import type { FloorLayout, LayoutMap } from './layout'
import { PathCache } from './navigation'
import type { Point } from './path'
import { streetPath } from './street-path'
import { entranceApproach } from '../../shared/office/entrance-approach'
import { bodiesShareElevation } from '../../shared/office/body-sweep'
import type { BodyFootprint } from '../../shared/office/body-footprints'
import { cityWalks, planRoam, walkBetween, type CityWalks, type RoutePoint } from './roaming'

// dry-new: PathCache is planar; transfers retain surface and connector metadata per waypoint.
export interface FloorWaypoint extends Point {
  elevation?: number
  physicalFloorId?: string | null
  connectorId?: string
  // A leg of the sidewalk network: walked without stepping onto a carriageway (P5).
  sidewalk?: true
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

function floorConnector(floor: FloorLayout): Point {
  return pointMetadata('connector' in floor ? floor.connector : undefined, floor.elevator)
}

export function floorEntrance(floor: FloorLayout): Point {
  return pointMetadata('entrance' in floor ? floor.entrance : undefined, floor.elevator)
}

function connectorId(floor: FloorLayout): string {
  if ('buildingId' in floor && typeof floor.buildingId === 'string') return floor.buildingId
  const connector = floorConnector(floor)
  return `connector:${connector.x}:${connector.z}`
}

export class FloorRoutes {
  private groundFloors: readonly FloorLayout[] = []
  private streetBlocks: NonNullable<LayoutMap['streetBlocks']> = []
  private readonly floors = new Map<string, FloorLayout>()
  private readonly caches = new Map<string, { json: string; paths: PathCache }>()
  private walks: { json: string; city: CityWalks | null } = { json: '[]', city: null }

  update(map: LayoutMap, occupiedFloorIds: readonly string[] = []): void {
    const live = new Set([...map.floors.map((floor) => floor.id), ...occupiedFloorIds])
    const occupiedConnectors = new Set(
      occupiedFloorIds.flatMap((id) => {
        const floor = this.floors.get(id)
        return floor ? [connectorId(floor)] : []
      })
    )
    // A departing upper-storey body still needs its building's ground-floor exit.
    for (const floor of this.floors.values())
      if (occupiedConnectors.has(connectorId(floor))) live.add(floor.id)
    for (const id of this.floors.keys())
      if (!live.has(id)) {
        this.floors.delete(id)
        this.caches.delete(id)
      }
    this.streetBlocks = map.streetBlocks ?? []
    const streetsJson = JSON.stringify(map.streets ?? [])
    if (streetsJson !== this.walks.json)
      this.walks = { json: streetsJson, city: map.streets?.length ? cityWalks(map.streets) : null }
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

  street(from: Point, to: Point): FloorWaypoint[] {
    return streetPath({
      from,
      to,
      blocks: [...this.groundFloors.flatMap((floor) => floor.zones), ...this.streetBlocks]
    }).map((point) => ({ ...point, elevation: 0, physicalFloorId: null }))
  }

  // Leisure only: ground arrivals keep street(), whose direct doorway legs they need (P5b).
  // A map without streets walks today's street route.
  sidewalkPath(from: Point, to: Point): FloorWaypoint[] {
    if (!this.walks.city) return this.street(from, to)
    return this.onSidewalk(walkBetween(this.walks.city, from, to) ?? [])
  }

  // Once round a loop near `from`, or nothing on a map without sidewalks.
  roam(from: Point, turn: number): FloorWaypoint[] {
    return this.walks.city ? this.onSidewalk(planRoam(from, this.walks.city, turn)) : []
  }

  hasSidewalks(): boolean {
    return this.walks.city !== null
  }

  isSidewalkOpen(point: Point): boolean {
    return this.walks.city?.isWalkable(point) ?? true
  }

  private onSidewalk(route: readonly RoutePoint[]): FloorWaypoint[] {
    return route.map((point) => ({
      x: point.x,
      z: point.z,
      elevation: 0,
      physicalFloorId: null,
      sidewalk: true
    }))
  }

  // Where a building's walkers step out onto the street: toGround ends here.
  doorstep(floor: FloorLayout): Point {
    const ground = this.groundOf(floor)
    return entranceApproach(ground, floorEntrance(ground))
  }

  private groundOf(floor: FloorLayout): FloorLayout {
    return (
      this.groundFloors.find((candidate) => connectorId(candidate) === connectorId(floor)) ?? floor
    )
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

  onFloor(floor: FloorLayout, from: Point, to: Point, door?: Point): FloorWaypoint[] {
    const paths = this.paths(floor.id)
    const route = door ? paths?.via(from, door, to) : paths?.get(from, to)
    return (route ?? []).map((point) => ({
      ...point,
      elevation: floorElevation(floor),
      physicalFloorId: floor.id
    }))
  }

  toFloor(view: AgentView, floor: FloorLayout, to: Point, door?: Point): FloorWaypoint[] {
    const current = this.floor(view.physicalFloorId)
    if (view.physicalFloorId === floor.id && (view.elevation ?? 0) === floorElevation(floor)) {
      if (this.paths(floor.id)?.contains(view)) return this.onFloor(floor, view, to, door)
      // A shrinking ground plate can leave a lounge sitter outside its new path grid.
      if (floorElevation(floor) !== 0) return []
      const entrance = floorEntrance(floor)
      const approach = this.street(view, entrance)
      const arrival = this.onFloor(floor, entrance, to, door)
      return approach.length && arrival.length ? [...approach, ...arrival] : []
    }
    const connector = floorConnector(floor)
    if (!current && (view.elevation ?? 0) !== 0) {
      const activeConnector =
        'connectorId' in view && typeof view.connectorId === 'string' ? view.connectorId : undefined
      if (activeConnector === connectorId(floor)) {
        const arrival = this.onFloor(floor, connector, to, door)
        return arrival.length
          ? [
              {
                x: view.x,
                z: view.z,
                elevation: view.elevation,
                physicalFloorId: null,
                connectorId: activeConnector
              },
              {
                ...connector,
                elevation: floorElevation(floor),
                physicalFloorId: floor.id,
                connectorId: activeConnector
              },
              ...arrival
            ]
          : []
      }
      const source = [...this.floors.values()].find(
        (candidate) => connectorId(candidate) === activeConnector
      )
      if (!source) return []
      const departure = this.toGround(view, source)
      const ground = departure.at(-1)
      if (!ground) return []
      const arrival = this.toFloor({ ...view, ...ground }, floor, to, door)
      return arrival.length ? [...departure, ...arrival] : []
    }
    if (current && connectorId(current) === connectorId(floor)) {
      const departure = this.onFloor(current, view, floorConnector(current))
      const arrival = this.onFloor(floor, connector, to, door)
      if (!departure.length || !arrival.length) return []
      return [
        ...departure,
        {
          ...connector,
          elevation: floorElevation(floor),
          physicalFloorId: floor.id,
          connectorId: connectorId(floor)
        },
        ...arrival
      ]
    }
    const route: FloorWaypoint[] = current
      ? this.toGround(view, current)
      : [{ x: view.x, z: view.z, elevation: view.elevation ?? 0, physicalFloorId: null }]
    if (!route.length) return []
    const entrance = floorEntrance(floor)
    const approach = entranceApproach(floor, entrance)
    const start = route.at(-1) ?? view
    const isAtEntrance = Math.hypot(start.x - entrance.x, start.z - entrance.z) < 0.1
    const street = isAtEntrance
      ? [{ ...entrance, elevation: 0, physicalFloorId: null }]
      : this.street(start, approach)
    if (!street.length) return []
    route.push(...street)
    if (floorElevation(floor) === 0) {
      const arrival = this.onFloor(floor, entrance, to, door)
      return arrival.length ? [...route, ...arrival] : []
    }
    const ground = this.groundOf(floor)
    const entry = this.onFloor(ground, entrance, connector)
    const arrival = this.onFloor(floor, connector, to, door)
    if (!entry.length || !arrival.length) return []
    route.push(...entry)
    if (floorElevation(floor) !== 0)
      route.push({
        ...connector,
        elevation: floorElevation(floor),
        physicalFloorId: floor.id,
        connectorId: connectorId(floor)
      })
    route.push(...arrival)
    return route
  }

  toGround(view: AgentView, floor: FloorLayout, door?: Point): FloorWaypoint[] {
    if (view.physicalFloorId === null && (view.elevation ?? 0) === 0)
      return [{ x: view.x, z: view.z, elevation: 0, physicalFloorId: null }]
    if (floorElevation(floor) === 0 && (view.elevation ?? 0) === 0) {
      const entrance = floorEntrance(floor)
      const departure = this.onFloor(floor, view, entrance, door)
      return departure.length
        ? [
            ...departure,
            { ...entranceApproach(floor, entrance), elevation: 0, physicalFloorId: null }
          ]
        : []
    }
    const connector = floorConnector(floor)
    const route: FloorWaypoint[] =
      view.physicalFloorId === null
        ? [{ x: view.x, z: view.z, elevation: view.elevation ?? 0, physicalFloorId: null }]
        : this.onFloor(floor, view, connector, door).map((point) => ({
            ...point,
            elevation: view.elevation ?? 0
          }))
    if (!route.length) return []
    if ((view.elevation ?? 0) !== 0)
      route.push({
        ...connector,
        elevation: 0,
        physicalFloorId: null,
        connectorId: connectorId(floor)
      })
    const ground = this.groundOf(floor)
    const entrance = floorEntrance(ground)
    const exit = this.onFloor(ground, connector, entrance)
    if (!exit.length) return []
    route.push(...exit, {
      ...entranceApproach(ground, entrance),
      elevation: 0,
      physicalFloorId: null
    })
    return route
  }
}
