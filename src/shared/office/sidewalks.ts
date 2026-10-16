import type { NavGrid } from '../../office/sim/path'
import type { Crosswalk } from './crosswalks'
import { MinHeap } from './min-heap'
import { EPSILON_M, asphaltOf, walkLines, type WalkKind, type WalkLine } from './sidewalk-lines'
import type { TownRoad } from './town-roads'
import type { WorldFootprint, WorldPoint } from './world-document-types'

export type NodeId = number
type SidewalkEdgeKind = WalkKind | 'hop'

interface SidewalkEdge {
  from: NodeId
  to: NodeId
  kind: SidewalkEdgeKind
  length: number
}

export interface SidewalkNetwork {
  // attachDoor adds to both; an id, once given, keeps its place.
  nodes: WorldPoint[]
  edges: SidewalkEdge[]
  // Kerb to kerb of every driven road, and the zebra bands that open it to walkers.
  carriageways: readonly WorldFootprint[]
  zebras: readonly WorldFootprint[]
}

// The grid shape the sim's pathfinder reads, and the same ground tested at a single point.
export interface PedestrianGround {
  grid: NavGrid
  isOpen(point: WorldPoint): boolean
}

const PATH_CACHE_SIZE = 512
// ClearSpent's ops-twin turn: radius and segments of each rounded corner.
const TURN_RADIUS_M = 1.2
const FILLET_SEGMENTS = 10
const DEDUPE_M = 0.05
// Fine enough that a 1 m sidewalk is four cells wide (citizens-5).
const GROUND_CELL_M = 0.25
const HOP_SAMPLE_M = 0.25

interface NetworkState {
  outgoing: number[][]
  nodeAt: Map<string, NodeId>
  paths: Map<string, readonly WorldPoint[] | null>
}
const states = new WeakMap<SidewalkNetwork, NetworkState>()

function stateOf(network: SidewalkNetwork): NetworkState {
  const state = states.get(network)
  if (!state) throw new Error('A sidewalk network must come from sidewalkNetwork()')
  return state
}

const keyOf = (point: WorldPoint): string =>
  `${Math.round(point.x / EPSILON_M)}:${Math.round(point.z / EPSILON_M)}`
const apart = (a: WorldPoint, b: WorldPoint): number => Math.hypot(b.x - a.x, b.z - a.z)
const strictlyIn = (rect: WorldFootprint, point: WorldPoint): boolean =>
  Math.abs(point.x - rect.x) < rect.width / 2 - EPSILON_M &&
  Math.abs(point.z - rect.z) < rect.depth / 2 - EPSILON_M

function nodeOf(network: SidewalkNetwork, point: WorldPoint): NodeId {
  const { nodeAt, outgoing } = stateOf(network)
  const key = keyOf(point)
  const known = nodeAt.get(key)
  if (known !== undefined) return known
  network.nodes.push({ x: point.x, z: point.z })
  outgoing.push([])
  nodeAt.set(key, network.nodes.length - 1)
  return network.nodes.length - 1
}

function addEdge(network: SidewalkNetwork, from: NodeId, to: NodeId, kind: SidewalkEdgeKind) {
  if (from === to) return
  network.edges.push({ from, to, kind, length: apart(network.nodes[from], network.nodes[to]) })
  stateOf(network).outgoing[from].push(network.edges.length - 1)
}

const pointOn = (line: WalkLine, along: number): WorldPoint =>
  line.alongX ? { x: along, z: line.fixed } : { x: line.fixed, z: along }

// The city's sidewalks as a directed graph, split wherever two walks meet (P3, corrected).
export function sidewalkNetwork(
  roads: readonly TownRoad[],
  crossings: readonly Crosswalk[]
): SidewalkNetwork {
  const network: SidewalkNetwork = { nodes: [], edges: [], ...asphaltOf(roads, crossings) }
  states.set(network, { outgoing: [], nodeAt: new Map(), paths: new Map() })
  const lines = walkLines(roads, crossings)
  const stops = lines.map((line) => [line.low, line.high])
  lines.forEach((first, index) => {
    for (let other = index + 1; other < lines.length; other++) {
      const second = lines[other]
      if (second.alongX === first.alongX) continue
      const meets =
        first.fixed >= second.low - EPSILON_M &&
        first.fixed <= second.high + EPSILON_M &&
        second.fixed >= first.low - EPSILON_M &&
        second.fixed <= first.high + EPSILON_M
      if (!meets) continue
      stops[index].push(second.fixed)
      stops[other].push(first.fixed)
    }
  })
  lines.forEach((line, index) => {
    const along = stops[index]
      .sort((first, second) => first - second)
      .filter((stop, at, sorted) => at === 0 || stop - sorted[at - 1] > EPSILON_M)
    const ids = along.map((stop) => nodeOf(network, pointOn(line, stop)))
    ids.slice(1).forEach((to, at) => {
      const from = ids[at]
      if (line.direction >= 0) addEdge(network, from, to, line.kind)
      if (line.direction <= 0) addEdge(network, to, from, line.kind)
    })
  })
  return network
}

// Splits `index` (and its twin the other way, on a two-way walk) at `point`, a node between.
// Cached paths stay right: a split moves no walk and shortens none.
function splitEdge(network: SidewalkNetwork, index: number, point: NodeId): void {
  const edge = network.edges[index]
  const twin = network.edges.findIndex(
    (other) => other.from === edge.to && other.to === edge.from && other.kind === edge.kind
  )
  for (const each of twin < 0 ? [index] : [index, twin]) {
    const { from, to, kind } = network.edges[each]
    network.edges[each] = {
      from,
      to: point,
      kind,
      length: apart(network.nodes[from], network.nodes[point])
    }
    addEdge(network, point, to, kind)
  }
}

const crossesCarriageway = (network: SidewalkNetwork, from: WorldPoint, to: WorldPoint) => {
  const steps = Math.max(1, Math.ceil(apart(from, to) / HOP_SAMPLE_M))
  for (let step = 0; step <= steps; step++) {
    const point = {
      x: from.x + ((to.x - from.x) * step) / steps,
      z: from.z + ((to.z - from.z) * step) / steps
    }
    if (network.carriageways.some((rect) => strictlyIn(rect, point))) return true
  }
  return false
}

// A door's node: on its sidewalk already (a lot door), or one hop off the nearest walk it can
// reach without stepping onto a carriageway (an entrance, onto its access lane or kerb).
export function attachDoor(network: SidewalkNetwork, door: WorldPoint): NodeId {
  const known = stateOf(network).nodeAt.get(keyOf(door))
  if (known !== undefined) return known
  const candidates = network.edges
    .flatMap((edge, index) => {
      if (edge.kind === 'crossing' || edge.kind === 'hop') return []
      const [a, b] = [network.nodes[edge.from], network.nodes[edge.to]]
      const at = {
        x: Math.min(Math.max(door.x, Math.min(a.x, b.x)), Math.max(a.x, b.x)),
        z: Math.min(Math.max(door.z, Math.min(a.z, b.z)), Math.max(a.z, b.z))
      }
      return [{ index, at, gap: apart(door, at) }]
    })
    .sort((first, second) => first.gap - second.gap || first.index - second.index)
  const best = candidates.find(
    ({ at, gap }) => gap <= EPSILON_M || !crossesCarriageway(network, door, at)
  )
  if (!best) return nodeOf(network, door)
  const { index, at, gap } = best
  const edge = network.edges[index]
  const landing = nodeOf(network, at)
  if (landing !== edge.from && landing !== edge.to) splitEdge(network, index, landing)
  if (gap <= EPSILON_M) return landing
  const doorId = nodeOf(network, door)
  addEdge(network, doorId, landing, 'hop')
  addEdge(network, landing, doorId, 'hop')
  return doorId
}

function shortestNodes(network: SidewalkNetwork, from: NodeId, to: NodeId): NodeId[] | null {
  const { outgoing } = stateOf(network)
  const cost = new Float64Array(network.nodes.length).fill(Infinity)
  const previous = new Int32Array(network.nodes.length).fill(-1)
  const frontier = new MinHeap()
  cost[from] = 0
  frontier.push(from, 0)
  while (frontier.size) {
    const next = frontier.pop()
    if (!next || next.cost > cost[next.id]) continue
    if (next.id === to) break
    for (const index of outgoing[next.id]) {
      const edge = network.edges[index]
      const through = next.cost + edge.length
      if (through >= cost[edge.to]) continue
      cost[edge.to] = through
      previous[edge.to] = next.id
      frontier.push(edge.to, through)
    }
  }
  if (!Number.isFinite(cost[to])) return null
  const ids = [to]
  while (ids[0] !== from) ids.unshift(previous[ids[0]])
  return ids
}

// Rounds each turn with a quadratic curve (ops-twin sim/lanes.ts filletCorners).
function filletCorners(path: readonly WorldPoint[]): WorldPoint[] {
  const straight = path.filter((point, index) => {
    const [before, after] = [path[index - 1], path[index + 1]]
    if (!before || !after) return true
    const [inX, inZ] = [point.x - before.x, point.z - before.z]
    const [outX, outZ] = [after.x - point.x, after.z - point.z]
    // Only a point straight on is dropped; a turn back keeps its corner.
    return Math.abs(inX * outZ - inZ * outX) > EPSILON_M || inX * outX + inZ * outZ <= 0
  })
  const out: WorldPoint[] = [straight[0]]
  for (let index = 1; index < straight.length - 1; index++) {
    const [before, corner, after] = [straight[index - 1], straight[index], straight[index + 1]]
    const [inLength, outLength] = [apart(before, corner), apart(corner, after)]
    const radius = Math.min(TURN_RADIUS_M, inLength / 2, outLength / 2)
    const start = {
      x: corner.x - ((corner.x - before.x) / inLength) * radius,
      z: corner.z - ((corner.z - before.z) / inLength) * radius
    }
    const end = {
      x: corner.x + ((after.x - corner.x) / outLength) * radius,
      z: corner.z + ((after.z - corner.z) / outLength) * radius
    }
    for (let step = 0; step <= FILLET_SEGMENTS; step++) {
      const t = step / FILLET_SEGMENTS
      const [a, b, c] = [(1 - t) * (1 - t), 2 * (1 - t) * t, t * t]
      out.push({
        x: a * start.x + b * corner.x + c * end.x,
        z: a * start.z + b * corner.z + c * end.z
      })
    }
  }
  if (straight.length > 1) out.push(straight[straight.length - 1])
  return out.filter((point, index) => index === 0 || apart(out[index - 1], point) > DEDUPE_M)
}

// The shortest walk between two nodes, with its turns rounded; null when none exists. The last
// PATH_CACHE_SIZE answers are kept, oldest forgotten first.
export function sidewalkPath(
  network: SidewalkNetwork,
  from: NodeId,
  to: NodeId
): readonly WorldPoint[] | null {
  const { paths } = stateOf(network)
  const key = `${from}>${to}`
  const cached = paths.get(key)
  if (cached !== undefined) {
    paths.delete(key)
    paths.set(key, cached)
    return cached
  }
  const ids = from === to ? [from] : shortestNodes(network, from, to)
  const path = ids ? filletCorners(ids.map((id) => network.nodes[id])) : null
  paths.set(key, path)
  if (paths.size > PATH_CACHE_SIZE) paths.delete(paths.keys().next().value ?? key)
  return path
}

// Which way a walker turns from one edge onto the next: left beats straight on beats right.
function turnRank(network: SidewalkNetwork, inbound: SidewalkEdge, outbound: SidewalkEdge): number {
  const { nodes } = network
  const inX = nodes[inbound.to].x - nodes[inbound.from].x
  const inZ = nodes[inbound.to].z - nodes[inbound.from].z
  const outX = nodes[outbound.to].x - nodes[outbound.from].x
  const outZ = nodes[outbound.to].z - nodes[outbound.from].z
  // Left of a heading (x east, z south) is (heading.z, -heading.x).
  const left = outX * inZ - outZ * inX
  if (left > EPSILON_M) return 3
  if (left < -EPSILON_M) return 1
  return outX * inX + outZ * inZ > 0 ? 2 : 0
}

// One closed, one-way loop round each block, walked turning towards it at every corner (ported
// from ops-twin loopAlong, with no carriageway U-turns).
export function ambientLoops(network: SidewalkNetwork): WorldPoint[][] {
  const { outgoing } = stateOf(network)
  const isLoopEdge = (index: number): boolean =>
    network.edges[index].kind === 'run' || network.edges[index].kind === 'cap'
  const used = new Set<number>()
  const loops: WorldPoint[][] = []
  network.edges.forEach((_, first) => {
    if (!isLoopEdge(first) || used.has(first)) return
    const trail = [first]
    const seen = new Set(trail)
    let isClosed = false
    for (let current = first; trail.length <= network.edges.length; ) {
      const inbound = network.edges[current]
      const next = outgoing[inbound.to]
        .filter(isLoopEdge)
        .map((index) => ({ index, rank: turnRank(network, inbound, network.edges[index]) }))
        .filter(({ rank }) => rank > 0)
        .sort((a, b) => b.rank - a.rank)[0]?.index
      if (next === first) isClosed = true
      if (next === undefined || next === first || seen.has(next) || used.has(next)) break
      trail.push(next)
      seen.add(next)
      current = next
    }
    if (!isClosed) return
    for (const index of trail) used.add(index)
    const start = network.nodes[network.edges[first].from]
    const end = network.nodes[network.edges[first].to]
    const middle = { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 }
    const corners = trail.slice(2).map((index) => network.nodes[network.edges[index].from])
    const loop = filletCorners([middle, end, ...corners, start, middle])
    loops.push([...loop.slice(0, -1), loop[0]])
  })
  return loops
}

// Where a walker may stand: open everywhere but inside a solid, or on a carriageway outside a
// zebra. A centre sample, never a disc: a disc would shut every 1 m sidewalk to a body (citizens-5).
export function pedestrianGround(
  network: SidewalkNetwork,
  bounds: WorldFootprint,
  solids: readonly WorldFootprint[] = []
): PedestrianGround {
  const isOpen = (point: WorldPoint): boolean =>
    !solids.some((rect) => strictlyIn(rect, point)) &&
    (!network.carriageways.some((rect) => strictlyIn(rect, point)) ||
      network.zebras.some((rect) => strictlyIn(rect, point)))
  const origin = {
    x: Math.floor((bounds.x - bounds.width / 2) / GROUND_CELL_M) * GROUND_CELL_M,
    z: Math.floor((bounds.z - bounds.depth / 2) / GROUND_CELL_M) * GROUND_CELL_M
  }
  const width = Math.ceil(bounds.width / GROUND_CELL_M) + 2
  const height = Math.ceil(bounds.depth / GROUND_CELL_M) + 2
  const blockedCells = new Uint8Array(width * height)
  // Rasterised rect by rect, as shut, reopened by zebras, then shut by solids.
  const paint = (rect: WorldFootprint, value: 0 | 1): void => {
    const first = Math.ceil((rect.x - rect.width / 2 - origin.x) / GROUND_CELL_M)
    const last = Math.floor((rect.x + rect.width / 2 - origin.x) / GROUND_CELL_M)
    const top = Math.ceil((rect.z - rect.depth / 2 - origin.z) / GROUND_CELL_M)
    const bottom = Math.floor((rect.z + rect.depth / 2 - origin.z) / GROUND_CELL_M)
    for (let row = Math.max(0, top); row <= Math.min(height - 1, bottom); row++)
      for (let column = Math.max(0, first); column <= Math.min(width - 1, last); column++) {
        const centre = { x: origin.x + column * GROUND_CELL_M, z: origin.z + row * GROUND_CELL_M }
        if (strictlyIn(rect, centre)) blockedCells[row * width + column] = value
      }
  }
  for (const rect of network.carriageways) paint(rect, 1)
  for (const rect of network.zebras) paint(rect, 0)
  for (const rect of solids) paint(rect, 1)
  return {
    grid: { width, height, cellSize: GROUND_CELL_M, origin, blocked: [], blockedCells },
    isOpen
  }
}
