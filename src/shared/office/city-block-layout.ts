import { WORLD_DOCUMENT_LIMITS } from './world-document-limits'
import type { WorldFootprint } from './world-document-types'

export const CITY_MAIN_CORRIDOR_METRES = 18
const CITY_LOCAL_CORRIDOR_METRES = 8
export const CITY_FRONTAGE_SETBACK_METRES = 3
const CITY_BLOCK_MARGIN_METRES = 2
const CITY_BLOCK_LIMIT = 256

// dry-new: the legacy 12 m campus lattice cannot share real block parcels with office placement.
export interface CityGrid {
  pitchX: number
  pitchZ: number
}

export interface CityBlock extends WorldFootprint {
  id: string
  column: number
  row: number
}

export function cityGrid(sites: readonly WorldFootprint[]): CityGrid {
  const clearance = CITY_MAIN_CORRIDOR_METRES + CITY_FRONTAGE_SETBACK_METRES * 2
  return {
    pitchX: Math.max(64, ...sites.map((site) => site.width + clearance)),
    pitchZ: Math.max(56, ...sites.map((site) => site.depth + clearance))
  }
}

export function cityStreetWidth(line: number): number {
  return line % 4 === 0 ? CITY_MAIN_CORRIDOR_METRES : CITY_LOCAL_CORRIDOR_METRES
}

export function cityBlock(grid: CityGrid, column: number, row: number): CityBlock {
  const west = column * grid.pitchX + cityStreetWidth(column) / 2 + CITY_BLOCK_MARGIN_METRES
  const east =
    (column + 1) * grid.pitchX - cityStreetWidth(column + 1) / 2 - CITY_BLOCK_MARGIN_METRES
  const north = row * grid.pitchZ + cityStreetWidth(row) / 2 + CITY_BLOCK_MARGIN_METRES
  const south = (row + 1) * grid.pitchZ - cityStreetWidth(row + 1) / 2 - CITY_BLOCK_MARGIN_METRES
  return {
    id: `city-block:${column}:${row}`,
    column,
    row,
    x: (west + east) / 2,
    z: (north + south) / 2,
    width: east - west,
    depth: south - north
  }
}

export function cityBlocksFor(sites: readonly WorldFootprint[]): CityBlock[] {
  const grid = cityGrid(sites)
  const cells = new Map<string, CityBlock>()
  const add = (column: number, row: number) => {
    const block = cityBlock(grid, column, row)
    if (
      Math.abs(block.x) + block.width / 2 > WORLD_DOCUMENT_LIMITS.worldMetres ||
      Math.abs(block.z) + block.depth / 2 > WORLD_DOCUMENT_LIMITS.worldMetres
    )
      return
    cells.set(block.id, block)
  }
  const columns = sites.flatMap((site) => [
    Math.floor((site.x - site.width / 2) / grid.pitchX),
    Math.floor((site.x + site.width / 2) / grid.pitchX)
  ])
  const rows = sites.flatMap((site) => [
    Math.floor((site.z - site.depth / 2) / grid.pitchZ),
    Math.floor((site.z + site.depth / 2) / grid.pitchZ)
  ])
  for (let column = Math.min(...columns); column <= Math.max(...columns); column++)
    for (let row = Math.min(...rows); row <= Math.max(...rows); row++) add(column, row)
  if (sites.length) {
    const centreX = sites.reduce((sum, site) => sum + site.x, 0) / sites.length
    const centreZ = sites.reduce((sum, site) => sum + site.z, 0) / sites.length
    return [...cells.values()]
      .sort(
        (first, second) =>
          Math.hypot(first.x - centreX, first.z - centreZ) -
            Math.hypot(second.x - centreX, second.z - centreZ) ||
          first.column - second.column ||
          first.row - second.row
      )
      .slice(0, CITY_BLOCK_LIMIT)
  }
  return []
}
