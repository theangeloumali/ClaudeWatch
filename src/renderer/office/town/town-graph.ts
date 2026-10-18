import type { Point } from '../../../office/sim/path'
import { LOT_PITCH_M } from './town-grid'
import type { RoadClass, TownRoad } from '../../../shared/office/town-roads'

interface RoadNode extends Point {
  // Its place in `RoadGraph.nodes`.
  id: number
}
export interface RoadEdge {
  from: number
  to: number
  class: RoadClass
  length: number
  width?: number
}
export interface RoadGraph {
  nodes: RoadNode[]
  edges: RoadEdge[]
}

// Roads are axis-aligned, so along one this is the distance.
export const apart = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.z - b.z)

// A node at every crossing of two road lines and every 12 m along a road; an edge per road
// stretch between two nodes.
export function roadGraph(roads: readonly TownRoad[]): RoadGraph {
  const nodes: RoadNode[] = []
  const edges: RoadEdge[] = []
  const idAt = new Map<string, number>()
  const nodeAt = ({ x, z }: Point): number => {
    const place = `${x.toFixed(6)}:${z.toFixed(6)}`
    const known = idAt.get(place)
    if (known !== undefined) return known
    nodes.push({ id: nodes.length, x, z })
    idAt.set(place, nodes.length - 1)
    return nodes.length - 1
  }
  const join = (from: number, to: number, road: TownRoad): void => {
    if (
      from === to ||
      edges.some(
        (edge) => (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from)
      )
    )
      return
    edges.push({
      from,
      to,
      class: road.class,
      length: apart(nodes[from], nodes[to]),
      ...(road.id.startsWith('city-street:') ? { width: road.width } : {})
    })
  }

  const liesOn = (point: Point, road: TownRoad): boolean =>
    Math.abs(apart(road.from, point) + apart(point, road.to) - apart(road.from, road.to)) < 1e-6 &&
    (Math.abs(road.from.x - road.to.x) < 1e-6
      ? Math.abs(point.x - road.from.x) < 1e-6
      : Math.abs(point.z - road.from.z) < 1e-6)
  for (const road of roads) {
    const length = apart(road.from, road.to)
    if (length < 1e-6) continue
    const points = [road.from, road.to]
    for (let along = LOT_PITCH_M; along < length; along += LOT_PITCH_M)
      points.push({
        x: road.from.x + ((road.to.x - road.from.x) * along) / length,
        z: road.from.z + ((road.to.z - road.from.z) * along) / length
      })
    for (const other of roads) {
      for (const point of [other.from, other.to]) if (liesOn(point, road)) points.push(point)
      const crossing =
        road.from.x === road.to.x
          ? { x: road.from.x, z: other.from.z }
          : { x: other.from.x, z: road.from.z }
      if (liesOn(crossing, road) && liesOn(crossing, other)) points.push(crossing)
    }
    const along = [
      ...new Set(
        points
          .sort((first, second) => apart(road.from, first) - apart(road.from, second))
          .map(nodeAt)
      )
    ]
    along.slice(1).forEach((node, index) => join(along[index], node, road))
  }
  return { nodes, edges }
}
