import { streetPath } from '../../office/sim/street-path'
import {
  cityGrid,
  cityStreetWidth,
  CITY_FRONTAGE_SETBACK_METRES,
  CITY_MAIN_CORRIDOR_METRES
} from './city-block-layout'
import type { WorldFootprint, WorldPoint, WorldVenue } from './world-document-types'

const CITY_ACCESS_WIDTH_METRES = 4
const ROAD_EDGE_MARGIN_METRES = 0.25
const NORMAL_FRONTAGE_REACH_METRES =
  CITY_MAIN_CORRIDOR_METRES / 2 + CITY_FRONTAGE_SETBACK_METRES + 2
type AccessSite = WorldFootprint & { entrance?: WorldPoint }

export function cityVenueSite(venue: Pick<WorldVenue, 'footprint' | 'entrance'>): AccessSite {
  return {
    ...venue.footprint,
    entrance: {
      x: venue.footprint.x + venue.entrance.x,
      z: venue.footprint.z + venue.entrance.z
    }
  }
}

// dry-new: the common lattice cannot provide frontage to a retained off-grid saved office.
export function cityAccessRoads(sites: readonly AccessSite[]) {
  const grid = cityGrid(sites)
  return sites.flatMap((site) => {
    const entrance = site.entrance ?? { x: site.x, z: site.z - site.depth / 2 }
    const acrossX =
      Math.abs((entrance.x - site.x) / site.width) > Math.abs((entrance.z - site.z) / site.depth)
    const normal = acrossX
      ? { x: Math.sign(entrance.x - site.x), z: 0 }
      : { x: 0, z: Math.sign(entrance.z - site.z) || -1 }
    const clearance =
      CITY_FRONTAGE_SETBACK_METRES + CITY_ACCESS_WIDTH_METRES / 2 + ROAD_EDGE_MARGIN_METRES
    const landing = { x: entrance.x + normal.x * clearance, z: entrance.z + normal.z * clearance }
    const candidates = [
      { axis: 'x', line: Math.floor((site.x - site.width / 2) / grid.pitchX) },
      { axis: 'x', line: Math.ceil((site.x + site.width / 2) / grid.pitchX) },
      { axis: 'z', line: Math.floor((site.z - site.depth / 2) / grid.pitchZ) },
      { axis: 'z', line: Math.ceil((site.z + site.depth / 2) / grid.pitchZ) }
    ]
      .map(({ axis, line }) => ({
        point:
          axis === 'x'
            ? { x: line * grid.pitchX, z: landing.z }
            : { x: landing.x, z: line * grid.pitchZ },
        streetWidth: cityStreetWidth(line)
      }))
      .filter(({ point, streetWidth }) =>
        sites.every(
          (obstacle) =>
            Math.abs(point.x - obstacle.x) >=
              (obstacle.width + streetWidth) / 2 + ROAD_EDGE_MARGIN_METRES ||
            Math.abs(point.z - obstacle.z) >=
              (obstacle.depth + streetWidth) / 2 + ROAD_EDGE_MARGIN_METRES
        )
      )
    if (
      candidates.some(
        ({ point }) =>
          Math.hypot(point.x - entrance.x, point.z - entrance.z) <= NORMAL_FRONTAGE_REACH_METRES
      )
    )
      return []
    const routes = candidates
      .map(({ point }) =>
        streetPath({ from: landing, to: point, blocks: sites, clearance, orthogonal: true })
      )
      .filter((route) => route.length > 1)
    const length = (route: readonly WorldPoint[]) =>
      route
        .slice(1)
        .reduce(
          (metres, point, index) =>
            metres + Math.hypot(point.x - route[index].x, point.z - route[index].z),
          0
        )
    const route = routes.sort((first, second) => length(first) - length(second))[0]
    if (!route) return []
    return route.slice(1).map((to, index) => ({
      id: `city-access:${site.x}:${site.z}:${index}`,
      class: 'lane' as const,
      from: route[index],
      to,
      width: CITY_ACCESS_WIDTH_METRES
    }))
  })
}

export function cityAccessFootprints(sites: readonly AccessSite[]): WorldFootprint[] {
  return cityAccessRoads(sites).map((road) => ({
    x: (road.from.x + road.to.x) / 2,
    z: (road.from.z + road.to.z) / 2,
    width: Math.abs(road.to.x - road.from.x) + road.width,
    depth: Math.abs(road.to.z - road.from.z) + road.width
  }))
}
