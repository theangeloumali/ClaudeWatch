import { cityScenerySites } from '../../../shared/office/city-scenery'
import { gapBetween, hashOf, rectOf } from '../themes/lot-math'
import {
  CITY_MAIN_CORRIDOR_METRES,
  cityBlocksFor,
  cityGrid,
  cityStreetWidth
} from '../../../shared/office/city-block-layout'
import type { Town } from './use-town-plan'
import type { TownLot } from './town-lots'
import { roadGraph } from './town-graph'
import { districtStreets, type DistrictSite } from './district-streets'
import type { TownDistrict } from './town-zones'
import { SIDEWALK_M } from './town-grid'

const FRONTAGE_USES: readonly TownDistrict[] = [
  'residential',
  'market',
  'residential',
  'entertainment',
  'workshop',
  'residential',
  'civic',
  'market'
]

// Office IDs share mixed-use street blocks, without campus belts or company districts.
export function distributedTown(town: Town, protectedSites: readonly DistrictSite[]): Town {
  if (!protectedSites.length) return town
  const sites = cityScenerySites(protectedSites)
  const grid = cityGrid(protectedSites)
  const lots: TownLot[] = sites.map((site, index) => {
    const seed = hashOf(site.id)
    const zone = FRONTAGE_USES[index % FRONTAGE_USES.length]
    const nearestOffice = Math.min(
      ...protectedSites.filter((site) => 'zones' in site).map((office) => gapBetween(site, office))
    )
    const heightLimit = Math.min(28, Math.max(8, nearestOffice * 0.7 + 4))
    const isSideways = site.facing === 'west' || site.facing === 'east'
    const isPositive = site.facing === 'east' || site.facing === 'south'
    const line = (isSideways ? site.column : site.row) + (isPositive ? 1 : 0)
    const width = cityStreetWidth(line)
    const frontage = width === CITY_MAIN_CORRIDOR_METRES ? 'avenue' : 'collector'
    const sidewalk =
      line * (isSideways ? grid.pitchX : grid.pitchZ) +
      (isPositive ? -1 : 1) * (width / 2 - SIDEWALK_M[frontage] / 2)
    return {
      ...site,
      seed,
      blockId: site.id,
      facing: site.facing,
      frontage,
      // Trips begin at the public kerb, not on a blocked building footprint.
      door: {
        x: isSideways ? sidewalk : site.x,
        z: isSideways ? site.z : sidewalk
      },
      zone,
      kind: 'building',
      maxHeight:
        zone === 'civic'
          ? heightLimit
          : zone === 'residential'
            ? Math.min(heightLimit, 18 + (seed % 9))
            : Math.min(heightLimit, 8 + (seed % 5)),
      zoneId: null,
      isFarRing: false,
      isLandmark: zone === 'civic'
    }
  })
  const roads = districtStreets({
    sites: protectedSites,
    obstacles: [...protectedSites, ...sites]
  })
  const roadSites = roads.map((road) => ({
    x: (road.from.x + road.to.x) / 2,
    z: (road.from.z + road.to.z) / 2,
    width: Math.abs(road.to.x - road.from.x) || road.width,
    depth: Math.abs(road.to.z - road.from.z) || road.width
  }))
  const blocks = cityBlocksFor(protectedSites).map((block) => ({
    ...block,
    zone: 'workshop' as const
  }))
  const footprint = [...protectedSites, ...blocks, ...roadSites]
  const extent = rectOf(
    Math.min(...footprint.map((site) => site.x - site.width / 2)),
    Math.max(...footprint.map((site) => site.x + site.width / 2)),
    Math.min(...footprint.map((site) => site.z - site.depth / 2)),
    Math.max(...footprint.map((site) => site.z + site.depth / 2))
  )
  return {
    ...town,
    owners: new Map(),
    green: [],
    plan: {
      ...town.plan,
      extent,
      envelope: extent,
      officeSites: protectedSites,
      blocks,
      lots,
      roads,
      promenades: roadSites,
      graph: roadGraph(roads, town.plan.claim)
    }
  }
}
