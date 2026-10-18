import { findPath, type NavGrid, type Point } from './path'
import type { FloorLayout, ZoneLayout } from './layout'
import type { BodyFootprint } from '../../shared/office/body-footprints'
import { bodiesShareElevation } from '../../shared/office/body-sweep'

export function officeGrid(floor: FloorLayout): NavGrid {
  const cellSize = 0.25
  const origin = { x: floor.x - floor.width / 2, z: floor.z - floor.depth / 2 }
  const blocked = new Set<string>()
  const wall = (zone: ZoneLayout) => {
    // Physical offices have one exterior shell; project envelopes are labels, not hidden walls.
    if (floor.buildingId && zone.kind === 'project') {
      for (const child of zone.children) wall(child)
      return
    }
    const left = zone.x - zone.width / 2,
      top = zone.z - zone.depth / 2
    const sideDoor = Math.abs(Math.abs(zone.door.x - zone.x) - zone.width / 2) < cellSize / 2
    const halfOpening = floor.buildingId ? (zone.kind === 'company' ? 1.6 : 0.8) : 0.5
    const add = (x: number, z: number) => {
      if (
        sideDoor
          ? Math.abs(x - zone.door.x) <= cellSize / 2 + 1e-6 &&
            Math.abs(z - zone.door.z) <= halfOpening
          : Math.abs(z - zone.door.z) <= cellSize / 2 + 1e-6 &&
            Math.abs(x - zone.door.x) <= halfOpening
      )
        return
      blocked.add(
        `${Math.round((x - origin.x) / cellSize)},${Math.round((z - origin.z) / cellSize)}`
      )
    }
    for (let x = left; x <= left + zone.width; x += cellSize) {
      add(x, top)
      add(x, top + zone.depth)
    }
    for (let z = top; z <= top + zone.depth; z += cellSize) {
      add(left, z)
      add(left + zone.width, z)
    }
    for (const child of zone.children) wall(child)
  }
  for (const company of floor.zones) wall(company)
  return {
    width: Math.round(floor.width / cellSize) + 1,
    height: Math.round(floor.depth / cellSize) + 1,
    cellSize,
    origin,
    blocked: [...blocked]
  }
}

export class PathCache {
  private readonly paths = new Map<string, Point[]>()
  private grid: NavGrid | null = null
  private blocked: Uint8Array | null = null
  constructor(private readonly floor: FloorLayout) {}

  private occupancy(): Uint8Array {
    this.grid ??= officeGrid(this.floor)
    if (!this.blocked) {
      this.blocked = new Uint8Array(this.grid.width * this.grid.height)
      for (const key of this.grid.blocked) {
        const [column, row] = key.split(',').map(Number)
        this.blocked[row * this.grid.width + column] = 1
      }
    }
    return this.blocked
  }

  isOpen(point: Point): boolean {
    this.grid ??= officeGrid(this.floor)
    const blocked = this.occupancy()
    const x = Math.round((point.x - this.grid.origin.x) / this.grid.cellSize)
    const z = Math.round((point.z - this.grid.origin.z) / this.grid.cellSize)
    return (
      x >= 0 &&
      z >= 0 &&
      x < this.grid.width &&
      z < this.grid.height &&
      blocked[z * this.grid.width + x] === 0
    )
  }

  contains(point: Point): boolean {
    return (
      Math.abs(point.x - this.floor.x) <= this.floor.width / 2 + 1e-6 &&
      Math.abs(point.z - this.floor.z) <= this.floor.depth / 2 + 1e-6
    )
  }

  around(options: {
    body: BodyFootprint
    to: Point
    obstacles: readonly BodyFootprint[]
  }): Point[] {
    this.grid ??= officeGrid(this.floor)
    const blockedCells = this.occupancy().slice()
    const { cellSize, origin, width, height } = this.grid
    for (const obstacle of options.obstacles) {
      if (obstacle.id === options.body.id) continue
      if (!bodiesShareElevation(options.body, obstacle)) continue
      const radius = options.body.radius + obstacle.radius + 0.05
      const left = Math.max(0, Math.floor((obstacle.x - radius - origin.x) / cellSize))
      const right = Math.min(width - 1, Math.ceil((obstacle.x + radius - origin.x) / cellSize))
      const top = Math.max(0, Math.floor((obstacle.z - radius - origin.z) / cellSize))
      const bottom = Math.min(height - 1, Math.ceil((obstacle.z + radius - origin.z) / cellSize))
      for (let x = left; x <= right; x++) {
        for (let z = top; z <= bottom; z++) {
          if (
            Math.hypot(origin.x + x * cellSize - obstacle.x, origin.z + z * cellSize - obstacle.z) <
            radius
          )
            blockedCells[z * width + x] = 1
        }
      }
    }
    return findPath({ ...this.grid, blockedCells }, options.body, options.to)
  }
  get(from: Point, to: Point): Point[] {
    const key = `${from.x},${from.z}:${to.x},${to.z}`
    let path = this.paths.get(key)
    if (!path) {
      // Built on first use: most feed messages only change activity and need no path.
      this.grid ??= officeGrid(this.floor)
      path = findPath(this.grid, from, to)
      this.paths.set(key, path)
    }
    return path.map((p) => ({ ...p }))
  }
  via(from: Point, door: Point, to: Point): Point[] {
    const first = this.get(from, door),
      second = this.get(door, to)
    return first.length && second.length ? [...first, ...second.slice(1)] : []
  }
}
