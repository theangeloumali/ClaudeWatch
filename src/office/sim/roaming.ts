import { crosswalks } from '../../shared/office/crosswalks'
import {
  ambientLoops,
  attachDoor,
  pedestrianGround,
  sidewalkNetwork,
  sidewalkPath,
  type NodeId,
  type SidewalkNetwork
} from '../../shared/office/sidewalks'
import type { TownRoad } from '../../shared/office/town-roads'
import type { WorldPoint } from '../../shared/office/world-document-types'

// How many agents walk loops at once; one cap, as the sim has no quality level. The largest of
// 4/8/12 that clears doorSwap (all called back in a crew swap): 12 left 3 unseated after
// 150 s and cost 1.7 ms a step against 0.13 ms at 8 (2026-10-16).
export const ROAMER_CAP = 8
// The loops nearest an agent's door it takes turns round, so a call back is a short walk.
const NEARBY_LOOPS = 3
// Within a body's reach of a walk it is on that walk; farther off it is at a door.
const ON_WALK_M = 1.25
const SAME_POINT_M = 1e-6
// Finer than any carriageway is wide.
const ROAD_SAMPLE_M = 0.25
// Only the point test is read; a zero box keeps the unused grid empty.
const NO_GRID = { x: 0, z: 0, width: 0, depth: 0 }

export type RoutePoint = WorldPoint

// The city's sidewalks and the block loops on them, built once per street list.
export interface CityWalks {
  network: SidewalkNetwork
  loops: readonly RoutePoint[][]
  isWalkable: (point: WorldPoint) => boolean
  // Whether walking straight through `route` keeps off every carriageway, zebras included.
  staysOffRoad: (route: readonly WorldPoint[]) => boolean
}

const apart = (a: WorldPoint, b: WorldPoint): number => Math.hypot(b.x - a.x, b.z - a.z)

export function cityWalks(roads: readonly TownRoad[]): CityWalks {
  const network = sidewalkNetwork(roads, crosswalks(roads))
  // Read before any door attaches, so each loop keeps the entry it was given.
  const loops = ambientLoops(network)
  const { isOpen } = pedestrianGround(network, NO_GRID)
  // Zebras shut too: a straight line over one is not a walk along its crossing.
  const { isOpen: isOffRoad } = pedestrianGround({ ...network, zebras: [] }, NO_GRID)
  const isLegOffRoad = (from: WorldPoint, to: WorldPoint): boolean => {
    const steps = Math.max(1, Math.ceil(apart(from, to) / ROAD_SAMPLE_M))
    return Array.from({ length: steps + 1 }, (_, step) => ({
      x: from.x + ((to.x - from.x) * step) / steps,
      z: from.z + ((to.z - from.z) * step) / steps
    })).every(isOffRoad)
  }
  return {
    network,
    loops,
    isWalkable: isOpen,
    staysOffRoad: (route) =>
      route.every((point, index) => index === 0 || isLegOffRoad(route[index - 1], point))
  }
}

// The node a walker at `point` joins at: ahead of it on the walk it is on, so it keeps the
// walk's one-way direction (A3), or its door's node when it stands off every walk.
function joinAt(network: SidewalkNetwork, point: WorldPoint): NodeId {
  let best: { node: NodeId; gap: number; ahead: number } | undefined
  for (const edge of network.edges) {
    if (edge.kind === 'hop') continue
    const [from, to] = [network.nodes[edge.from], network.nodes[edge.to]]
    const length = apart(from, to) || 1
    const along =
      ((point.x - from.x) * (to.x - from.x) + (point.z - from.z) * (to.z - from.z)) / length ** 2
    const t = Math.min(1, Math.max(0, along))
    const gap = apart(point, { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t })
    const ahead = apart(point, to)
    if (gap > ON_WALK_M) continue
    if (
      !best ||
      gap < best.gap - SAME_POINT_M ||
      (gap <= best.gap + SAME_POINT_M && ahead < best.ahead)
    )
      best = { node: edge.to, gap, ahead }
  }
  return best ? best.node : attachDoor(network, point)
}

// The sidewalk walk from `from` to the door or walk point `to`; null when none reaches it.
export function walkBetween(
  walks: CityWalks,
  from: WorldPoint,
  to: WorldPoint
): RoutePoint[] | null {
  const path = sidewalkPath(
    walks.network,
    joinAt(walks.network, from),
    attachDoor(walks.network, to)
  )
  if (!path) return null
  return apart(from, path[0]) > SAME_POINT_M ? [from, ...path] : [...path]
}

// A roam from `from`: to one of the loops nearest it, chosen by `turn`, and once round it,
// joined and left where it passes closest, so the lap ends near home.
export function planRoam(from: WorldPoint, walks: CityWalks, turn: number): RoutePoint[] {
  const nearest = walks.loops
    .map((loop) => {
      const gaps = loop.map((point) => apart(from, point))
      const gap = Math.min(...gaps)
      return { loop, gap, entry: gaps.indexOf(gap) }
    })
    .sort((first, second) => first.gap - second.gap)
    .slice(0, NEARBY_LOOPS)
  const pick = nearest[Math.abs(Math.trunc(turn)) % Math.max(1, nearest.length)]
  if (!pick) return []
  // A loop's last point repeats its first.
  const open = pick.loop.slice(0, -1)
  const lap = [...open.slice(pick.entry), ...open.slice(0, pick.entry), open[pick.entry]]
  const approach = walkBetween(walks, from, lap[0])
  return approach ? [...approach, ...lap.slice(1)] : []
}

// Who is on a loop now, and how many outings each agent has begun; an outing alternates
// between a venue and a loop, venue first (A4).
export class RoamOutings {
  private readonly roamers = new Set<string>()
  private readonly begun = new Map<string, number>()

  constructor(private readonly cap = ROAMER_CAP) {}

  // Keeps only agents still out on a loop, and the counts of agents still present.
  prune(isOnLoop: (key: string) => boolean, isPresent: (key: string) => boolean): void {
    for (const key of this.roamers) if (!isOnLoop(key)) this.roamers.delete(key)
    for (const key of this.begun.keys()) if (!isPresent(key)) this.begun.delete(key)
  }

  isRoaming(key: string): boolean {
    return this.roamers.has(key)
  }

  hasRoom(): boolean {
    return this.roamers.size < this.cap
  }

  prefersLoop(key: string): boolean {
    return (this.begun.get(key) ?? 0) % 2 === 1
  }

  outings(key: string): number {
    return this.begun.get(key) ?? 0
  }

  begin(key: string, isLoop: boolean): void {
    this.begun.set(key, this.outings(key) + 1)
    if (isLoop) this.roamers.add(key)
  }

  end(key: string): void {
    this.roamers.delete(key)
  }
}
