import type { WorldFootprint, WorldPoint } from './world-document-types'
import {
  CITY_MAIN_CORRIDOR_METRES,
  cityBlocksFor,
  cityGrid,
  cityStreetWidth
} from './city-block-layout'
import { cityAccessRoads } from './city-access'
import type { TownRoad } from './town-roads'

// dry-new: lattice roads cannot connect arbitrary plots; reuse the simulation's sparse corner router.
export type DistrictSite = WorldFootprint & { entrance?: WorldPoint }

// The renderer's town plan lays its streets here, for the live city and the editor preview alike.
export function districtStreets(options: {
  sites: readonly DistrictSite[]
  obstacles: readonly WorldFootprint[]
}): TownRoad[] {
  const roads: TownRoad[] = []
  const blocks = cityBlocksFor(options.sites)
  if (!blocks.length) return roads
  const grid = cityGrid(options.sites)
  const west = Math.min(...blocks.map((block) => block.column))
  const east = Math.max(...blocks.map((block) => block.column)) + 1
  const north = Math.min(...blocks.map((block) => block.row))
  const south = Math.max(...blocks.map((block) => block.row)) + 1
  const addStreet = (from: WorldPoint, to: WorldPoint, width: number) => {
    const axis = from.z === to.z ? 'x' : 'z'
    const fixed = axis === 'x' ? 'z' : 'x'
    let intervals = [{ min: from[axis], max: to[axis] }]
    for (const obstacle of options.obstacles) {
      const acrossSize = fixed === 'x' ? obstacle.width : obstacle.depth
      if (Math.abs(obstacle[fixed] - from[fixed]) >= (acrossSize + width) / 2 + 0.25) continue
      const alongSize = axis === 'x' ? obstacle.width : obstacle.depth
      const low = obstacle[axis] - alongSize / 2 - width / 2 - 0.25
      const high = obstacle[axis] + alongSize / 2 + width / 2 + 0.25
      intervals = intervals.flatMap((interval) => {
        if (high <= interval.min || low >= interval.max) return [interval]
        const pieces = []
        if (low > interval.min) pieces.push({ min: interval.min, max: low })
        if (high < interval.max) pieces.push({ min: high, max: interval.max })
        return pieces
      })
    }
    for (const interval of intervals) {
      if (interval.max - interval.min < 0.5) continue
      roads.push({
        id: `city-street:${roads.length}`,
        class: width === CITY_MAIN_CORRIDOR_METRES ? 'avenue' : 'collector',
        from: { ...from, [axis]: interval.min },
        to: { ...to, [axis]: interval.max },
        width
      })
    }
  }
  for (let column = west; column <= east; column++)
    addStreet(
      { x: column * grid.pitchX, z: north * grid.pitchZ },
      { x: column * grid.pitchX, z: south * grid.pitchZ },
      cityStreetWidth(column)
    )
  for (let row = north; row <= south; row++)
    addStreet(
      { x: west * grid.pitchX, z: row * grid.pitchZ },
      { x: east * grid.pitchX, z: row * grid.pitchZ },
      cityStreetWidth(row)
    )
  return [...roads, ...cityAccessRoads(options.sites)]
}
