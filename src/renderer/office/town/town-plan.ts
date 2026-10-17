import type { QualityLevel } from '../logic/quality'
import { boundsOfZone } from '../logic/zone-framing'
import type { ZoneGeometry } from '../scene-model'
import { contains, gapBetween, grow, rectOf, type Rect } from '../themes/lot-math'
import { roadGraph, type RoadGraph } from './town-graph'
import {
  BLOCK_PITCH_M,
  MIN_BELT_M,
  OLD_TOWN_BLOCKS,
  RING_M,
  TOWN_REACH,
  cellRect,
  type TownSize
} from './town-grid'
import { townLots, type TownLot } from './town-lots'
import { roadPromenades, townRoads, type TownRoad } from './town-roads'
import { lotSites, parkPromenades } from './town-sites'
import { zoneOfBlock, type TownDistrict } from './town-zones'

interface TownBlock extends Rect {
  // `block:${column}:${row}` on the 24 m lattice.
  id: string
  column: number
  row: number
  zone: TownDistrict
}

// The retired single-campus town, planned whole from a claim. The city shares its shape (TownPlan).
export interface CampusPlan {
  size: TownSize
  claim: Rect
  // The claim less the belt: it always contains the plate, and moves only when the claim does.
  envelope: Rect
  extent: Rect
  roads: TownRoad[]
  // Each block's ground inside the town. Where the claim cuts a block, the block still spans
  // the cut: the campus lies over that part.
  blocks: TownBlock[]
  lots: TownLot[]
  // Strips where a citizen must be seen: protected like offices by the height rule.
  promenades: Rect[]
  graph: RoadGraph
}

// The city every scene draws: each office on a plot of its own.
export interface TownPlan extends CampusPlan {
  officeSites: readonly Rect[]
}

// How far the town is drawn: the old town to the west, a ring on the other three sides. The
// pure planner defaults to the full town; the owner's setting picks the size in the app.
export function townExtent(claim: Rect, detail: QualityLevel, size: TownSize = 'city'): Rect {
  const { minX, maxX, minZ, maxZ } = boundsOfZone(claim)
  const reach = TOWN_REACH[size]
  const ring = Math.min(RING_M[detail], reach.ringM)
  const oldTownBlocks = Math.min(OLD_TOWN_BLOCKS[detail], reach.oldTownBlocks)
  return rectOf(minX - oldTownBlocks * BLOCK_PITCH_M, maxX + ring, minZ - ring, maxZ + ring)
}

function blocksOf(claim: Rect, extent: Rect): TownBlock[] {
  const reach = boundsOfZone(extent)
  const blocks: TownBlock[] = []
  const lastColumn = Math.ceil(reach.maxX / BLOCK_PITCH_M)
  const lastRow = Math.ceil(reach.maxZ / BLOCK_PITCH_M)
  for (let column = Math.floor(reach.minX / BLOCK_PITCH_M); column < lastColumn; column++)
    for (let row = Math.floor(reach.minZ / BLOCK_PITCH_M); row < lastRow; row++) {
      const whole = boundsOfZone(cellRect(column, row, BLOCK_PITCH_M))
      const ground = rectOf(
        Math.max(whole.minX, reach.minX),
        Math.min(whole.maxX, reach.maxX),
        Math.max(whole.minZ, reach.minZ),
        Math.min(whole.maxZ, reach.maxZ)
      )
      if (contains(claim, ground)) continue
      blocks.push({
        id: `block:${column}:${row}`,
        column,
        row,
        ...ground,
        zone: zoneOfBlock(column, row)
      })
    }
  return blocks
}

// The whole town for a claim, from nothing. Pure: the same claim, level and size give the same
// plan.
export function planTown(claim: Rect, detail: QualityLevel, size: TownSize = 'city'): CampusPlan {
  const extent = townExtent(claim, detail, size)
  const roads = townRoads(claim, extent)
  const sites = lotSites(claim, extent)
  const promenades = [...roadPromenades(roads, claim), ...parkPromenades(sites)]
  return {
    size,
    claim,
    envelope: grow(claim, -MIN_BELT_M),
    extent,
    roads,
    blocks: blocksOf(claim, extent),
    lots: townLots(sites, claim, promenades, detail),
    promenades: promenades.map(({ x, z, width, depth }) => ({ x, z, width, depth })),
    graph: roadGraph(roads, claim)
  }
}

// A claim steps rarely, and a floor change that does not step it must not rebuild the town.
const MAX_REMEMBERED_PLANS = 16
const remembered = new Map<string, CampusPlan>()

// `planTown`, remembered by claim, level and size, so the same claim hands back the same plan.
export function townBlocks(claim: Rect, detail: QualityLevel, size: TownSize = 'city'): CampusPlan {
  const { minX, maxX, minZ, maxZ } = boundsOfZone(claim)
  const key = `${minX}:${maxX}:${minZ}:${maxZ}:${detail}:${size}`
  const plan = remembered.get(key) ?? planTown(claim, detail, size)
  // Set again on a hit, so the plan in use is the last one forgotten.
  remembered.delete(key)
  remembered.set(key, plan)
  if (remembered.size > MAX_REMEMBERED_PLANS)
    for (const oldest of [...remembered.keys()].slice(0, remembered.size - MAX_REMEMBERED_PLANS))
      remembered.delete(oldest)
  return plan
}

// The company nearest a rectangle. Sorted, and a tie kept by the first: the rule the ring of
// lots has always used.
export function nearestCompany(rect: Rect, zones: readonly ZoneGeometry[]): ZoneGeometry | null {
  const companies = zones
    .filter((zone) => zone.kind === 'company')
    .sort((a, b) => a.id.localeCompare(b.id))
  if (companies.length === 0) return null
  return companies.reduce((best, zone) =>
    gapBetween(rect, zone) < gapBetween(rect, best) ? zone : best
  )
}
