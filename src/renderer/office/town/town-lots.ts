import type { Point } from '../../../office/sim/path'
import type { RoadClass } from '../../../shared/office/town-roads'
import type { WallSide } from '../logic/room-layout'
import type { Rect } from '../themes/lot-math'
import type { Lot } from '../themes/surroundings'
import type { TownDistrict } from './town-zones'

// A lot's place in the city: what it fronts and where its door is.
interface LotSite extends Rect {
  id: string
  seed: number
  column: number
  row: number
  zone: TownDistrict
  blockId: string
  facing: WallSide
  frontage: RoadClass
  // On the kerb in front of it: where a trip starts and ends.
  door: Point
}

// A Lot (themes/surroundings.ts) with a place in the city.
export interface TownLot extends Lot, LotSite {
  isFarRing: boolean
  isLandmark: boolean
}
