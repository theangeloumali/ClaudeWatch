import type { WorldFootprint } from './world-document-types'
import { CITY_FRONTAGE_SETBACK_METRES, cityBlocksFor, type CityBlock } from './city-block-layout'
import { overlaps } from './world-document-geometry'
import { cityAccessFootprints } from './city-access'

const CITY_SCENERY_LIMIT = 64
const CITY_SCENERY_FRAGMENT_LIMIT = CITY_SCENERY_LIMIT * 4
const CITY_SCENERY_INSET_METRES = 1.5
const MIN_SCENERY_EDGE_METRES = 4
const MIN_BUILDING_FRONTAGE_METRES = 12
const TARGET_BUILDING_FRONTAGE_METRES = 18
const FRONTAGE_PLOT_GAP_METRES = 2
const FRONTAGE_END_MARGIN_METRES = 1
// A 3 m rear gap must leave two 12 m plots even when the street-facing edge is narrow.
const MAX_BUILDING_DEPTH_METRES = 27
const TARGET_BUILDING_DEPTH_METRES = 18
const SCENERY_REAR_GAP_METRES = 3

export interface CityScenerySite extends WorldFootprint {
  id: string
  column: number
  row: number
  facing: 'north' | 'south' | 'east' | 'west'
}

// Simulation and rendering use this same bounded set; visual thinning cannot open a lot.
export function cityScenerySites(protectedSites: readonly WorldFootprint[]): CityScenerySite[] {
  const exclusions = [...protectedSites, ...cityAccessFootprints(protectedSites)]
  const blockPlots = cityBlocksFor(protectedSites)
    .sort((first, second) => first.column - second.column || first.row - second.row)
    .map((block) => plotsForBlock(block, exclusions))
    .filter((plots) => plots.length > 0)
  // Sample the whole occupied extent when even one plot per eligible block exceeds the cap.
  const selectedBlocks =
    blockPlots.length <= CITY_SCENERY_LIMIT
      ? blockPlots
      : Array.from(
          { length: CITY_SCENERY_LIMIT },
          (_, index) =>
            blockPlots[Math.floor((index * (blockPlots.length - 1)) / (CITY_SCENERY_LIMIT - 1))]
        )
  const candidates: CityScenerySite[] = []
  for (let plotIndex = 0; plotIndex < CITY_SCENERY_LIMIT; plotIndex++) {
    for (const plots of selectedBlocks) {
      const plot = plots[plotIndex]
      if (!plot) continue
      candidates.push(plot)
      if (candidates.length >= CITY_SCENERY_LIMIT) return candidates
    }
  }
  return candidates
}

// dry-new: parcel streams share each block's budget without exhausting its first spare strip.
function plotsForBlock(
  block: CityBlock,
  protectedSites: readonly WorldFootprint[]
): CityScenerySite[] {
  const parcelPlots = spareFrontages(block, protectedSites).map((parcel, index) =>
    subdivideStreetFrontage(
      {
        ...parcel,
        id: `city-lot:${block.column}:${block.row}:${index}`,
        column: block.column,
        row: block.row,
        facing: nearestStreetFrontage(parcel, block)
      },
      block
    )
  )
  const plots: CityScenerySite[] = []
  for (let pass = 0; pass < CITY_SCENERY_LIMIT; pass++) {
    const previousCount = plots.length
    for (const stream of parcelPlots) {
      const nextPlot = stream.next()
      if (nextPlot.done) continue
      plots.push(nextPlot.value)
      if (plots.length >= CITY_SCENERY_LIMIT) return plots
    }
    if (plots.length === previousCount) break
  }
  return plots
}

function nearestStreetFrontage(
  parcel: WorldFootprint,
  block: CityBlock
): CityScenerySite['facing'] {
  const edges = [
    {
      facing: 'north',
      gap: parcel.z - parcel.depth / 2 - (block.z - block.depth / 2),
      length: parcel.width
    },
    {
      facing: 'south',
      gap: block.z + block.depth / 2 - (parcel.z + parcel.depth / 2),
      length: parcel.width
    },
    {
      facing: 'west',
      gap: parcel.x - parcel.width / 2 - (block.x - block.width / 2),
      length: parcel.depth
    },
    {
      facing: 'east',
      gap: block.x + block.width / 2 - (parcel.x + parcel.width / 2),
      length: parcel.depth
    }
  ] satisfies Array<{ facing: CityScenerySite['facing']; gap: number; length: number }>
  edges.sort((first, second) => first.gap - second.gap || second.length - first.length)
  return edges[0].facing
}

// Carved parcels share one subdivision path for frontage and rear access.
function* subdivideStreetFrontage(
  site: CityScenerySite,
  block: CityBlock
): Generator<CityScenerySite, void, unknown> {
  const isSideways = site.facing === 'west' || site.facing === 'east'
  const frontageLength = isSideways ? site.depth : site.width
  const depthLength = isSideways ? site.width : site.depth
  const usableLength = frontageLength - FRONTAGE_END_MARGIN_METRES * 2
  const frontageCount = Math.max(
    1,
    Math.min(
      Math.ceil(
        (usableLength + FRONTAGE_PLOT_GAP_METRES) /
          (TARGET_BUILDING_FRONTAGE_METRES + FRONTAGE_PLOT_GAP_METRES)
      ),
      Math.floor(
        (usableLength + FRONTAGE_PLOT_GAP_METRES) /
          (MIN_BUILDING_FRONTAGE_METRES + FRONTAGE_PLOT_GAP_METRES)
      )
    )
  )
  const depthCount =
    depthLength <= MAX_BUILDING_DEPTH_METRES
      ? 1
      : Math.ceil(
          (depthLength + SCENERY_REAR_GAP_METRES) /
            (TARGET_BUILDING_DEPTH_METRES + SCENERY_REAR_GAP_METRES)
        )
  const endMargin = frontageCount > 1 ? FRONTAGE_END_MARGIN_METRES : 0
  const plotFrontage =
    (frontageLength - endMargin * 2 - FRONTAGE_PLOT_GAP_METRES * (frontageCount - 1)) /
    frontageCount
  const plotDepth = (depthLength - SCENERY_REAR_GAP_METRES * (depthCount - 1)) / depthCount
  const totalPlots = frontageCount * depthCount
  const emittedCount = Math.min(totalPlots, CITY_SCENERY_LIMIT)
  // Keep practical dimensions on huge imports; spread capped plots rather than stretching them.
  for (let plotIndex = 0; plotIndex < emittedCount; plotIndex++) {
    const sampleIndex =
      plotIndex % 2 === 0 ? plotIndex / 2 : emittedCount - 1 - Math.floor(plotIndex / 2)
    const gridIndex = Math.floor((sampleIndex * totalPlots) / emittedCount)
    const frontageIndex = gridIndex % frontageCount
    const depthIndex = Math.floor(gridIndex / frontageCount)
    const frontageOffset =
      -frontageLength / 2 +
      endMargin +
      plotFrontage / 2 +
      frontageIndex * (plotFrontage + FRONTAGE_PLOT_GAP_METRES)
    const depthOffset =
      -depthLength / 2 + plotDepth / 2 + depthIndex * (plotDepth + SCENERY_REAR_GAP_METRES)
    const plot: CityScenerySite = {
      ...site,
      id: gridIndex === 0 ? site.id : `${site.id}:frontage:${frontageIndex}:depth:${depthIndex}`,
      x: site.x + (isSideways ? depthOffset : frontageOffset),
      z: site.z + (isSideways ? frontageOffset : depthOffset),
      width: isSideways ? plotDepth : plotFrontage,
      depth: isSideways ? plotFrontage : plotDepth
    }
    yield { ...plot, facing: nearestStreetFrontage(plot, block) }
  }
}

// Carve reserved offices/venues out before filling their remaining street frontage.
function spareFrontages(
  block: CityBlock,
  protectedSites: readonly WorldFootprint[]
): WorldFootprint[] {
  let parcels: WorldFootprint[] = [
    {
      ...block,
      width: block.width - CITY_SCENERY_INSET_METRES * 2,
      depth: block.depth - CITY_SCENERY_INSET_METRES * 2
    }
  ].filter(isPracticalParcel)
  for (const reserved of protectedSites) {
    const obstacle = {
      ...reserved,
      width: reserved.width + CITY_FRONTAGE_SETBACK_METRES * 2,
      depth: reserved.depth + CITY_FRONTAGE_SETBACK_METRES * 2
    }
    parcels = parcels.flatMap((parcel) => {
      if (!overlaps(parcel, obstacle)) return [parcel]
      const west = parcel.x - parcel.width / 2,
        east = parcel.x + parcel.width / 2
      const north = parcel.z - parcel.depth / 2,
        south = parcel.z + parcel.depth / 2
      const left = Math.max(west, obstacle.x - obstacle.width / 2)
      const right = Math.min(east, obstacle.x + obstacle.width / 2)
      const top = Math.max(north, obstacle.z - obstacle.depth / 2)
      const bottom = Math.min(south, obstacle.z + obstacle.depth / 2)
      return [
        { x: (west + left) / 2, z: parcel.z, width: left - west, depth: parcel.depth },
        { x: (right + east) / 2, z: parcel.z, width: east - right, depth: parcel.depth },
        { x: (left + right) / 2, z: (north + top) / 2, width: right - left, depth: top - north },
        {
          x: (left + right) / 2,
          z: (bottom + south) / 2,
          width: right - left,
          depth: south - bottom
        }
      ].filter(isPracticalParcel)
    })
    // Bound fragmentation independently of saved dimensions and the final plot cap.
    if (parcels.length > CITY_SCENERY_FRAGMENT_LIMIT) {
      const fragments = parcels
      parcels = Array.from(
        { length: CITY_SCENERY_FRAGMENT_LIMIT },
        (_, index) =>
          fragments[Math.floor((index * fragments.length) / CITY_SCENERY_FRAGMENT_LIMIT)]
      )
    }
  }
  return parcels
}

function isPracticalParcel(parcel: WorldFootprint): boolean {
  return (
    Math.min(parcel.width, parcel.depth) >= MIN_SCENERY_EDGE_METRES &&
    Math.max(parcel.width, parcel.depth) >= MIN_BUILDING_FRONTAGE_METRES
  )
}
