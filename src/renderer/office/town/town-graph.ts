import type { Point } from '../../../office/sim/path'
import { clamp } from '../../../shared/range'
import { boundsOfZone, type Bounds } from '../logic/zone-framing'
import { grow, type Rect } from '../themes/lot-math'
import { LOT_PITCH_M, ROAD_WIDTH_M } from './town-grid'
import type { RoadClass, TownRoad } from './town-roads'

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

// Where the avenue meets the boulevard, in front of the gate: as far as a citizen comes.
export function gatePlaza(claim: Rect): Point {
  return { x: claim.x - claim.width / 2 + ROAD_WIDTH_M.boulevard / 2, z: 0 }
}

// A road's end that stops at a side of the claim, corners left out.
function isOnClaimSide(point: Point, claim: Bounds): boolean {
  const isBesideX = point.z > claim.minZ && point.z < claim.maxZ
  const isBesideZ = point.x > claim.minX && point.x < claim.maxX
  return (
    (isBesideX && (point.x === claim.minX || point.x === claim.maxX)) ||
    (isBesideZ && (point.z === claim.minZ || point.z === claim.maxZ))
  )
}

// A node at every crossing of two road lines and at each boulevard corner; an edge per road
// stretch between two nodes. A road that stops at the claim is joined on to the boulevard.
export function roadGraph(roads: readonly TownRoad[], claim: Rect): RoadGraph {
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

  const edge = boundsOfZone(claim)
  const centre = boundsOfZone(grow(claim, -ROAD_WIDTH_M.boulevard / 2))
  const joinedRoads = [...roads]
  for (const road of roads.filter((each) => each.class !== 'boulevard')) {
    for (const end of [road.from, road.to].filter((point) => isOnClaimSide(point, edge))) {
      const onBoulevard = {
        x: clamp(end.x, [centre.minX, centre.maxX]),
        z: clamp(end.z, [centre.minZ, centre.maxZ])
      }
      if (roads.some((candidate) => candidate.class === 'boulevard'))
        joinedRoads.push({ ...road, from: end, to: onBoulevard })
    }
  }
  const liesOn = (point: Point, road: TownRoad): boolean =>
    Math.abs(apart(road.from, point) + apart(point, road.to) - apart(road.from, road.to)) < 1e-6 &&
    (Math.abs(road.from.x - road.to.x) < 1e-6
      ? Math.abs(point.x - road.from.x) < 1e-6
      : Math.abs(point.z - road.from.z) < 1e-6)
  for (const road of joinedRoads) {
    const length = apart(road.from, road.to)
    if (length < 1e-6) continue
    const points = [road.from, road.to]
    for (let along = LOT_PITCH_M; along < length; along += LOT_PITCH_M)
      points.push({
        x: road.from.x + ((road.to.x - road.from.x) * along) / length,
        z: road.from.z + ((road.to.z - road.from.z) * along) / length
      })
    for (const other of joinedRoads) {
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
