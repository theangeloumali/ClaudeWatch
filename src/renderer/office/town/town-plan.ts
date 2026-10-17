import type { Rect } from '../themes/lot-math'
import type { TownRoad } from '../../../shared/office/town-roads'
import type { RoadGraph } from './town-graph'
import type { TownSize } from './town-grid'
import type { TownLot } from './town-lots'
import type { TownDistrict } from './town-zones'

interface TownBlock extends Rect {
  id: string
  column: number
  row: number
  zone: TownDistrict
}

// The city every scene draws: each office on a plot of its own.
export interface TownPlan {
  size: TownSize
  claim: Rect
  envelope: Rect
  extent: Rect
  roads: TownRoad[]
  blocks: TownBlock[]
  lots: TownLot[]
  // Strips where a citizen must be seen: protected like offices by the height rule.
  promenades: Rect[]
  graph: RoadGraph
  officeSites: readonly Rect[]
}
