import type { Point } from '../../../office/sim/path'
import type { RoadClass } from '../../../shared/office/town-roads'
import { compareKeys } from '../logic/city-signals'
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
  // On the kerb in front of it: where a trip starts and ends. Null where no street reaches its
  // front, so the lot is drawn but never a destination.
  door: Point | null
}

// A Lot (themes/surroundings.ts) with a place in the city.
export interface TownLot extends Lot, LotSite {
  isFarRing: boolean
  isLandmark: boolean
}

// A lot a trip may start or end at.
export type DooredLot = TownLot & { door: Point }

// The lots with a door, in id order so a draw never depends on the plan's order or the locale.
export const lotsWithDoors = (lots: readonly TownLot[]): DooredLot[] =>
  lots
    .filter((lot): lot is DooredLot => lot.door !== null)
    .sort((first, second) => compareKeys(first.id, second.id))
