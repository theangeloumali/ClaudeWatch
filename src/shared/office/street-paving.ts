import { CROSSWALK_DEPTH_M, type Crosswalk } from './crosswalks'
import { crossStreetsAt } from './sidewalk-lines'
import { SIDEWALK_M, type TownRoad } from './town-roads'
import type { WorldFootprint } from './world-document-types'

// A road's sidewalks run kerb to kerb; its carriageway lies a sidewalk's width inside each kerb.
type PavedLayer = 'sidewalk' | 'carriageway'

const insetOf = (road: TownRoad, layer: PavedLayer): number =>
  layer === 'carriageway' ? SIDEWALK_M[road.class] : 0

// The ground `road` paves at `layer`, for the paint and the walkers' ground alike. A street that
// ends on a cross street's centre line carries on to that street's far edge, so an L-corner is
// paved through rather than left a bare square that vehicles cut.
export function pavedStrip(
  road: TownRoad,
  roads: readonly TownRoad[],
  layer: PavedLayer
): WorldFootprint {
  const streets = roads.filter((other) => other.class !== 'lane')
  const reach = (end: number): number =>
    road.class === 'lane'
      ? 0
      : Math.max(
          0,
          ...crossStreetsAt(road, end, streets).map(
            (other) => other.width / 2 - insetOf(other, layer)
          )
        )
  const isAlongX = road.from.z === road.to.z
  const [a, b] = isAlongX ? [road.from.x, road.to.x] : [road.from.z, road.to.z]
  const low = Math.min(a, b) - reach(Math.min(a, b))
  const high = Math.max(a, b) + reach(Math.max(a, b))
  const across = road.width - 2 * insetOf(road, layer)
  return isAlongX
    ? { x: (low + high) / 2, z: road.from.z, width: high - low, depth: across }
    : { x: road.from.x, z: (low + high) / 2, width: across, depth: high - low }
}

// Kerb to kerb of every driven road, and the zebra bands painted across them.
export function asphaltOf(roads: readonly TownRoad[], crossings: readonly Crosswalk[]) {
  const carriageways = roads
    .filter((road) => road.class !== 'lane')
    .map((road) => pavedStrip(road, roads, 'carriageway'))
  const zebras = crossings.map(
    (crossing): WorldFootprint => ({
      ...crossing.centre,
      width: crossing.axis === 'z' ? CROSSWALK_DEPTH_M : crossing.halfLength * 2,
      depth: crossing.axis === 'z' ? crossing.halfLength * 2 : CROSSWALK_DEPTH_M
    })
  )
  return { carriageways, zebras }
}
