import type { Point } from '../../../office/sim/path'
import { clamp } from '../../../shared/range'
import { apart } from './town-graph'
import type { TownPlan } from './town-plan'
import type { RoadClass } from '../../../shared/office/town-roads'

// One straight stretch of a road's centre line.
export interface Leg {
  from: Point
  to: Point
  class: RoadClass
  width?: number
}

interface Way {
  from: number
  to: number
  class: RoadClass
  costPerMetre: number
  width?: number
}

// The plan's road graph as a vehicle may drive it.
export interface RoadNet {
  plan: TownPlan
  ways: Way[]
  // The ways that meet at each node.
  waysAt: number[][]
}

const built = new WeakMap<TownPlan, RoadNet>()

// Built once per plan: the ambient fleet and every work trip drive the same net.
export function roadNet(plan: TownPlan): RoadNet {
  const known = built.get(plan)
  if (known) return known
  const net = netOf(plan)
  built.set(plan, net)
  return net
}

// A vehicle never uses a footpath lane, and every road is the same to it.
function netOf(plan: TownPlan): RoadNet {
  const { nodes, edges } = plan.graph
  const ways = edges
    .filter((edge) => edge.class !== 'lane')
    .map(
      (edge): Way => ({
        from: edge.from,
        to: edge.to,
        class: edge.class,
        ...(edge.width === undefined ? {} : { width: edge.width }),
        costPerMetre: 1
      })
    )
  const waysAt: number[][] = nodes.map(() => [])
  ways.forEach((way, index) => {
    waysAt[way.from].push(index)
    waysAt[way.to].push(index)
  })
  return { plan, ways, waysAt }
}

// A vehicle meets a place no nearer a dead end than the longest vehicle's half length (transit's
// nose), so it stops and turns back on the asphalt, not across the carriageway's end.
const DEAD_END_SETBACK_M = 3

// The stretch of a way a vehicle may stop on: all of it, less the setback at a dead end.
function stopSpan(net: RoadNet, way: Way): [Point, Point] {
  const { nodes } = net.plan.graph
  const [a, b] = [nodes[way.from], nodes[way.to]]
  const length = apart(a, b)
  if (length === 0) return [a, b]
  const share = (node: number): number =>
    net.waysAt[node].length === 1 ? Math.min(DEAD_END_SETBACK_M, length / 2) / length : 0
  const at = (t: number): Point => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
  return [at(share(way.from)), at(1 - share(way.to))]
}

// The nearest point of the net to a place off it: where a door meets its road.
function attach(net: RoadNet, point: Point): { way: number; at: Point } {
  let best = { way: -1, at: point, gap: Infinity }
  net.ways.forEach((way, index) => {
    const [a, b] = stopSpan(net, way)
    const at = {
      x: clamp(point.x, [Math.min(a.x, b.x), Math.max(a.x, b.x)]),
      z: clamp(point.z, [Math.min(a.z, b.z), Math.max(a.z, b.z)])
    }
    const gap = Math.hypot(point.x - at.x, point.z - at.z)
    if (gap < best.gap) best = { way: index, at, gap }
  })
  return best
}

// The cheapest way along the roads between two places beside them, as centre-line legs.
export function roadPath(net: RoadNet, from: Point, to: Point): Leg[] | null {
  const { nodes } = net.plan.graph
  const start = attach(net, from)
  const end = attach(net, to)
  if (start.way < 0 || end.way < 0) return null
  const [first, last] = [net.ways[start.way], net.ways[end.way]]

  const cost = nodes.map(() => Infinity)
  // The way each node was reached by; -1 for the two ends of the first way.
  const reachedBy = nodes.map(() => -1)
  const isSettled = nodes.map(() => false)
  for (const node of [first.from, first.to])
    cost[node] = apart(start.at, nodes[node]) * first.costPerMetre
  for (;;) {
    let nearest = -1
    for (let node = 0; node < nodes.length; node++)
      if (!isSettled[node] && cost[node] < (nearest < 0 ? Infinity : cost[nearest])) nearest = node
    if (nearest < 0) break
    isSettled[nearest] = true
    for (const index of net.waysAt[nearest]) {
      const way = net.ways[index]
      const other = way.from === nearest ? way.to : way.from
      const through = cost[nearest] + apart(nodes[nearest], nodes[other]) * way.costPerMetre
      if (through < cost[other]) {
        cost[other] = through
        reachedBy[other] = index
      }
    }
  }

  const costVia = (node: number): number =>
    cost[node] + apart(nodes[node], end.at) * last.costPerMetre
  const direct = start.way === end.way ? apart(start.at, end.at) * first.costPerMetre : Infinity
  const arrival = costVia(last.from) <= costVia(last.to) ? last.from : last.to
  const legs: Leg[] = []
  const legFor = (way: Way, from: Point, to: Point): Leg => ({
    from,
    to,
    class: way.class,
    ...(way.width === undefined ? {} : { width: way.width })
  })
  if (direct <= costVia(arrival)) legs.push(legFor(first, start.at, end.at))
  else {
    if (!Number.isFinite(costVia(arrival))) return null
    legs.push(legFor(last, nodes[arrival], end.at))
    let node = arrival
    while (reachedBy[node] >= 0) {
      const way = net.ways[reachedBy[node]]
      const before = way.from === node ? way.to : way.from
      legs.unshift(legFor(way, nodes[before], nodes[node]))
      node = before
    }
    legs.unshift(legFor(first, start.at, nodes[node]))
  }
  return legs.filter((leg) => apart(leg.from, leg.to) > 0)
}

// Each leg keeps its own width, or the walk back falls onto the class default (citizens-1).
export function reversed(legs: readonly Leg[]): Leg[] {
  return legs.map((leg) => ({ ...leg, from: leg.to, to: leg.from })).reverse()
}
