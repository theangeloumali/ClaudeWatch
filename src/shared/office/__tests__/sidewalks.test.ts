import { describe, expect, it } from 'vitest'
import { crosswalks } from '../crosswalks'
import {
  ambientLoops,
  attachDoor,
  pedestrianGround,
  sidewalkNetwork,
  sidewalkPath,
  type SidewalkNetwork
} from '../sidewalks'
import { SIDEWALK_M, type TownRoad } from '../town-roads'
import type { WorldFootprint, WorldPoint } from '../world-document-types'
import { OFF_GRID_SITES, liveCitySites, streetsFor } from './live-city-streets.test-utils'

const SAMPLE_M = 0.25

interface City {
  roads: TownRoad[]
  doors: WorldPoint[]
  bounds: WorldFootprint
}

function cityOf(sites: typeof OFF_GRID_SITES): City {
  const roads = streetsFor(sites)
  const reach = (pick: (point: WorldPoint) => number, sign: 1 | -1): number =>
    sign * Math.max(...roads.flatMap((road) => [road.from, road.to].map((end) => sign * pick(end))))
  const [west, east] = [reach((end) => end.x, -1) - 12, reach((end) => end.x, 1) + 12]
  const [north, south] = [reach((end) => end.z, -1) - 12, reach((end) => end.z, 1) + 12]
  return {
    roads,
    doors: sites.flatMap((site) => (site.entrance ? [site.entrance] : [])),
    bounds: {
      x: (west + east) / 2,
      z: (north + south) / 2,
      width: east - west,
      depth: south - north
    }
  }
}

const CITIES: readonly (readonly [string, () => City])[] = [
  ['the live city', () => cityOf(liveCitySites())],
  ['an off-grid city with access lanes', () => cityOf(OFF_GRID_SITES)]
]

const strictlyIn = (rect: WorldFootprint, point: WorldPoint): boolean =>
  Math.abs(point.x - rect.x) < rect.width / 2 - 1e-6 &&
  Math.abs(point.z - rect.z) < rect.depth / 2 - 1e-6

// The carriageways the town paints, and its zebras, built from the roads and nothing else.
function asphaltOf(roads: readonly TownRoad[]) {
  const carriageways = roads
    .filter((road) => road.class !== 'lane')
    .map((road): WorldFootprint => {
      const alongX = road.from.z === road.to.z
      const length = Math.abs(road.to.x - road.from.x) + Math.abs(road.to.z - road.from.z)
      const across = road.width - 2 * SIDEWALK_M[road.class]
      return {
        x: (road.from.x + road.to.x) / 2,
        z: (road.from.z + road.to.z) / 2,
        width: alongX ? length : across,
        depth: alongX ? across : length
      }
    })
  const zebras = crosswalks(roads).map(
    (crossing): WorldFootprint => ({
      ...crossing.centre,
      width: crossing.axis === 'z' ? 3 : crossing.halfLength * 2,
      depth: crossing.axis === 'z' ? crossing.halfLength * 2 : 3
    })
  )
  const isOnAsphalt = (point: WorldPoint): boolean =>
    carriageways.some((rect) => strictlyIn(rect, point)) &&
    !zebras.some((rect) => strictlyIn(rect, point))
  return { carriageways, isOnAsphalt }
}

function samples(points: readonly WorldPoint[]): WorldPoint[] {
  return points.slice(1).flatMap((to, index) => {
    const from = points[index]
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / SAMPLE_M))
    return Array.from({ length: steps + 1 }, (_, step) => ({
      x: from.x + ((to.x - from.x) * step) / steps,
      z: from.z + ((to.z - from.z) * step) / steps
    }))
  })
}

const edgePoints = (network: SidewalkNetwork, index: number): WorldPoint[] => [
  network.nodes[network.edges[index].from],
  network.nodes[network.edges[index].to]
]

function doorPaths(network: SidewalkNetwork, doors: readonly WorldPoint[]) {
  const ids = doors.map((door) => attachDoor(network, door))
  return ids.flatMap((from, fromIndex) =>
    ids.flatMap((to, toIndex) =>
      fromIndex === toIndex ? [] : [{ fromIndex, toIndex, path: sidewalkPath(network, from, to) }]
    )
  )
}

describe.each(CITIES)('the sidewalk network on %s', (_name, build) => {
  const city = build()
  const network = sidewalkNetwork(city.roads, crosswalks(city.roads))
  const { carriageways, isOnAsphalt } = asphaltOf(city.roads)
  const paths = doorPaths(network, city.doors)

  it('reaches every door from every other door', () => {
    const missing = paths.filter(({ path }) => !path || path.length < 2)
    expect(missing.map(({ fromIndex, toIndex }) => `${fromIndex}>${toIndex}`)).toEqual([])
  })

  it('puts no sampled point of any path or loop on a carriageway outside a crosswalk', () => {
    const loops = ambientLoops(network)
    expect(loops.length).toBeGreaterThan(0)
    const routes = [...paths.flatMap(({ path }) => (path ? [path] : [])), ...loops]
    const onAsphalt = routes.flatMap((route) => samples(route).filter(isOnAsphalt))
    expect(onAsphalt.slice(0, 5)).toEqual([])
  })

  it('hops from a door to the sidewalk without touching a carriageway', () => {
    const hops = network.edges.flatMap((edge, index) => (edge.kind === 'hop' ? [index] : []))
    for (const index of hops) {
      const touching = samples(edgePoints(network, index)).filter((point) =>
        carriageways.some((rect) => strictlyIn(rect, point))
      )
      expect(touching, `hop ${index}`).toEqual([])
    }
  })

  it('crosses a street only along a crosswalk edge', () => {
    const entering = network.edges.flatMap((edge, index) =>
      edge.kind !== 'crossing' &&
      samples(edgePoints(network, index)).some((point) =>
        carriageways.some((rect) => strictlyIn(rect, point))
      )
        ? [`${edge.kind} ${index}`]
        : []
    )
    expect(entering).toEqual([])
  })

  it('crosses each zebra both ways, 1.5 m apart', () => {
    const crossingEdges = network.edges.filter((edge) => edge.kind === 'crossing')
    expect(crossingEdges.length).toBeGreaterThan(0)
    expect(crossingEdges.length % 2).toBe(0)
    for (const edge of crossingEdges) {
      const [from, to] = [network.nodes[edge.from], network.nodes[edge.to]]
      const twin = crossingEdges.find((other) => {
        const [a, b] = [network.nodes[other.from], network.nodes[other.to]]
        const isAlongZ = from.x === to.x
        return isAlongZ
          ? Math.abs(Math.abs(a.x - from.x) - 1.5) < 1e-6 && a.z === to.z && b.z === from.z
          : Math.abs(Math.abs(a.z - from.z) - 1.5) < 1e-6 && a.x === to.x && b.x === from.x
      })
      expect(twin, `crossing ${from.x}:${from.z}`).toBeDefined()
    }
  })

  it('never lets two directions share a run', () => {
    const runs = network.edges
      .filter((edge) => edge.kind === 'run')
      .map((edge) => ({ from: network.nodes[edge.from], to: network.nodes[edge.to] }))
    const lineOf = ({ from, to }: (typeof runs)[number]) =>
      from.z === to.z
        ? {
            key: `z:${from.z.toFixed(4)}`,
            low: Math.min(from.x, to.x),
            high: Math.max(from.x, to.x),
            sign: Math.sign(to.x - from.x)
          }
        : {
            key: `x:${from.x.toFixed(4)}`,
            low: Math.min(from.z, to.z),
            high: Math.max(from.z, to.z),
            sign: Math.sign(to.z - from.z)
          }
    const lines = runs.map(lineOf)
    const clashes = lines.flatMap((line, index) =>
      lines
        .slice(index + 1)
        .flatMap((other) =>
          other.key === line.key &&
          Math.min(line.high, other.high) - Math.max(line.low, other.low) > 1e-6 &&
          other.sign !== line.sign
            ? [`${line.key} ${line.low}..${line.high}`]
            : []
        )
    )
    expect(lines.length).toBeGreaterThan(0)
    expect(clashes).toEqual([])
  })

  it('keeps every edge connected on the pedestrian ground grid', () => {
    const ground = pedestrianGround(network, city.bounds)
    const { origin, cellSize, width, blockedCells } = ground.grid
    const isCellOpen = (point: WorldPoint): boolean => {
      const column = Math.round((point.x - origin.x) / cellSize)
      const row = Math.round((point.z - origin.z) / cellSize)
      return blockedCells?.[row * width + column] === 0
    }
    expect(cellSize).toBe(0.25)
    const closed = network.edges.flatMap((_, index) =>
      samples(edgePoints(network, index)).filter((point) => !isCellOpen(point))
    )
    expect(closed.slice(0, 5)).toEqual([])
    const shut = network.edges.flatMap((_, index) =>
      samples(edgePoints(network, index)).filter((point) => !ground.isOpen(point))
    )
    expect(shut.slice(0, 5)).toEqual([])
  })

  it('closes the pedestrian ground on every carriageway outside a zebra', () => {
    const ground = pedestrianGround(network, city.bounds)
    for (const rect of carriageways) {
      const middle = { x: rect.x, z: rect.z }
      expect(ground.isOpen(middle), `${rect.x}:${rect.z}`).toBe(isOnAsphalt(middle) === false)
    }
    for (const crossing of crosswalks(city.roads))
      expect(ground.isOpen(crossing.centre), crossing.id).toBe(true)
  })
})

describe('sidewalk network details', () => {
  const roads = streetsFor(liveCitySites())
  const network = sidewalkNetwork(roads, crosswalks(roads))

  it('trims each run at the cross street’s sidewalk centre', () => {
    // Two 18 m avenues cross at the origin: their sidewalk centres are 8.25 m out.
    const inBox = network.edges
      .filter((edge) => edge.kind === 'run')
      .flatMap((edge) => [network.nodes[edge.from], network.nodes[edge.to]])
      .filter((point) => Math.abs(point.x) <= 9 && Math.abs(point.z) <= 9)
    expect(inBox.length).toBeGreaterThan(0)
    for (const point of inBox) {
      expect(Math.abs(point.x)).toBeCloseTo(8.25)
      expect(Math.abs(point.z)).toBeCloseTo(8.25)
    }
  })

  it('keeps the city’s keep-left sign: the avenue’s north sidewalk runs east', () => {
    const along = (z: number) =>
      network.edges
        .filter((edge) => edge.kind === 'run')
        .map((edge) => [network.nodes[edge.from], network.nodes[edge.to]])
        .filter(([from, to]) => from.z === z && to.z === z && from.x > 9 && to.x > 9)
        .map(([from, to]) => Math.sign(to.x - from.x))
    expect(new Set(along(-8.25))).toEqual(new Set([1]))
    expect(new Set(along(8.25))).toEqual(new Set([-1]))
  })

  it('attaches a door already on its sidewalk with no hop', () => {
    const before = network.edges.filter((edge) => edge.kind === 'hop').length
    const onRun = { x: 40, z: 8.25 }
    const id = attachDoor(network, onRun)
    expect(network.nodes[id]).toEqual(onRun)
    expect(network.edges.filter((edge) => edge.kind === 'hop')).toHaveLength(before)
  })

  it('closes every ambient loop on the sidewalks, one way round', () => {
    for (const loop of ambientLoops(network)) {
      expect(loop.length).toBeGreaterThan(4)
      expect(loop.at(-1)).toEqual(loop[0])
    }
  })

  it('builds the network and 48 citizen paths inside 50 ms', () => {
    const doors = liveCitySites().flatMap((site) => (site.entrance ? [site.entrance] : []))
    const timeOnce = (): number => {
      const started = performance.now()
      const fresh = sidewalkNetwork(roads, crosswalks(roads))
      const ids = doors.map((door) => attachDoor(fresh, door))
      for (let trip = 0; trip < 48; trip++)
        sidewalkPath(fresh, ids[trip % ids.length], ids[(trip * 7 + 3) % ids.length])
      return performance.now() - started
    }
    // Best of three: the budget is the work's cost, not a loaded machine's scheduling.
    expect(Math.min(timeOnce(), timeOnce(), timeOnce())).toBeLessThan(50)
  })
})
