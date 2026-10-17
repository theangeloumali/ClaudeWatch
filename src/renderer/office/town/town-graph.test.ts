import { describe, expect, it } from 'vitest'
import { LIVE_FLOORS } from '../themes/floors.test-utils'
import { campusClaim, neededClaim } from './town-claim'
import { roadGraph, type RoadEdge, type RoadGraph } from './town-graph'
import { LOT_PITCH_M, ROAD_WIDTH_M } from './town-grid'
import { townRoads } from './town-roads'
import { edges, fromEdges, fullExtent, overlapping } from './town.test-utils'

// The nodes one can reach over the edges that are open, and every node such an edge touches.
function reached(graph: RoadGraph, isOpen: (edge: RoadEdge) => boolean) {
  const open = graph.edges.filter(isOpen)
  const seen = new Set<number>([open[0].from])
  const queue = [open[0].from]
  while (queue.length > 0) {
    const at = queue.pop()
    for (const edge of open) {
      const next = edge.from === at ? edge.to : edge.to === at ? edge.from : null
      if (next !== null && !seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return { seen, touched: new Set(open.flatMap((edge) => [edge.from, edge.to])) }
}

describe.each(LIVE_FLOORS)('roadGraph: %s', (_name, floor) => {
  const claim = campusClaim(neededClaim(floor), null)
  const roads = townRoads(claim, fullExtent(claim))
  const graph = roadGraph(roads, claim)
  const edge = edges(claim)
  const placeOf = new Map(graph.nodes.map((node) => [`${node.x}:${node.z}`, node.id]))

  it('numbers its nodes by their place in the list, one to a place', () => {
    graph.nodes.forEach((node, index) => expect(node.id).toBe(index))
    expect(placeOf.size).toBe(graph.nodes.length)
  })

  it('has a node at every crossing of two road lines', () => {
    const across = roads.filter((road) => road.from.z === road.to.z)
    const down = roads.filter((road) => road.from.x === road.to.x)
    let crossings = 0
    for (const a of across)
      for (const d of down) {
        const x = d.from.x
        const z = a.from.z
        const isCrossing =
          x >= Math.min(a.from.x, a.to.x) &&
          x <= Math.max(a.from.x, a.to.x) &&
          z >= Math.min(d.from.z, d.to.z) &&
          z <= Math.max(d.from.z, d.to.z)
        if (!isCrossing) continue
        crossings++
        expect(placeOf.has(`${x}:${z}`)).toBe(true)
      }
    expect(crossings).toBeGreaterThan(50)
  })

  it('joins only neighbours on one straight road, and measures the stretch', () => {
    for (const each of graph.edges) {
      const from = graph.nodes[each.from]
      const to = graph.nodes[each.to]
      expect(from.x === to.x || from.z === to.z).toBe(true)
      expect(each.length).toBe(Math.abs(to.x - from.x) + Math.abs(to.z - from.z))
      expect(each.length).toBeGreaterThan(0)
      expect(each.length).toBeLessThanOrEqual(LOT_PITCH_M)
    }
  })

  it('keeps every node off the campus inside the boulevard', () => {
    const inside = fromEdges({
      west: edge.west + ROAD_WIDTH_M.boulevard,
      east: edge.east - ROAD_WIDTH_M.boulevard,
      north: edge.north + ROAD_WIDTH_M.boulevard,
      south: edge.south - ROAD_WIDTH_M.boulevard
    })
    for (const node of graph.nodes)
      expect(overlapping({ ...node, width: 0.1, depth: 0.1 }, inside)).toBe(false)
  })

  it('is one network on foot', () => {
    expect(reached(graph, () => true).seen.size).toBe(graph.nodes.length)
  })

  it('is one network for vehicles, which never use a lane', () => {
    const { seen, touched } = reached(graph, (each) => each.class !== 'lane')
    expect(seen.size).toBe(touched.size)
  })

  it('stays a few hundred nodes', () => {
    expect(graph.nodes.length).toBeLessThan(600)
  })
})
