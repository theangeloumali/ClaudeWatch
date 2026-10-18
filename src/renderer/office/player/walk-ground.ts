import { findPath, type NavGrid, type Point } from '../../../office/sim/path'
import { FURNITURE_SCALE } from '../../../shared/office/figure-scale'
import {
  DESK_REACH,
  roomWallSegments,
  doorSide,
  SIDE_NORMAL,
  type DooredRect
} from '../logic/room-layout'
import type { FloorGeometry, ZoneGeometry } from '../scene-model'
import { contains, type Rect } from '../themes/lot-math'
import { GROUND_Y } from '../themes/surroundings'

export interface WalkGround {
  // The sim's grid shape, so its pathfinder walks the player too.
  grid: NavGrid
  isOpen(point: Point): boolean
}

const WALK_CELL_M = 0.5
// The widest desk any theme draws, so the player stands clear of all of them.
// The scene draws desks enlarged with the agents, so the footprint the player walks round is too.
const DESK_M = { width: 1.3 * FURNITURE_SCALE, depth: 0.65 * FURNITURE_SCALE }
const DOORSTEP_M = 1
// How far a click inside something solid looks for open ground: past half the largest lot.
const NEAREST_OPEN_CELLS = 24
const SIGHT_STEP_M = 0.1
const EDGE_EPSILON = 1e-6

function flatten(zones: readonly ZoneGeometry[]): ZoneGeometry[] {
  return zones.flatMap((zone) => [zone, ...flatten(zone.children)])
}

// Where the player may stand, over the whole of `extent`: closed under the town's lots and the
// belt's plots (`solids`), walls, desks and seats, and open everywhere else, roads included.
export function walkGround(
  floor: FloorGeometry,
  solids: readonly Rect[],
  extent: Rect
): WalkGround {
  const origin = {
    x: Math.floor((extent.x - extent.width / 2) / WALK_CELL_M) * WALK_CELL_M,
    z: Math.floor((extent.z - extent.depth / 2) / WALK_CELL_M) * WALK_CELL_M
  }
  const width = Math.ceil(extent.width / WALK_CELL_M) + 2
  const height = Math.ceil(extent.depth / WALK_CELL_M) + 2
  const closed = new Uint8Array(width * height)
  const indexOf = (point: Point): number => {
    const column = Math.round((point.x - origin.x) / WALK_CELL_M)
    const row = Math.round((point.z - origin.z) / WALK_CELL_M)
    return column < 0 || row < 0 || column >= width || row >= height ? -1 : row * width + column
  }
  const mark = (point: Point, value: 0 | 1): void => {
    const index = indexOf(point)
    if (index >= 0) closed[index] = value
  }
  const closeRect = (rect: Rect): void => {
    const first = Math.ceil((rect.x - rect.width / 2 - origin.x) / WALK_CELL_M - EDGE_EPSILON)
    const last = Math.floor((rect.x + rect.width / 2 - origin.x) / WALK_CELL_M + EDGE_EPSILON)
    const top = Math.ceil((rect.z - rect.depth / 2 - origin.z) / WALK_CELL_M - EDGE_EPSILON)
    const bottom = Math.floor((rect.z + rect.depth / 2 - origin.z) / WALK_CELL_M + EDGE_EPSILON)
    for (let row = Math.max(0, top); row <= Math.min(height - 1, bottom); row++)
      for (let column = Math.max(0, first); column <= Math.min(width - 1, last); column++)
        closed[row * width + column] = 1
  }
  // Stepped at half a cell, so a wall or a desk off the lattice still closes an unbroken line.
  const closeLine = (from: Point, to: Point): void => {
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / (WALK_CELL_M / 2))
    for (let step = 0; step <= steps; step++) {
      const share = steps === 0 ? 0 : step / steps
      mark({ x: from.x + (to.x - from.x) * share, z: from.z + (to.z - from.z) * share }, 1)
    }
  }

  for (const solid of solids) closeRect(solid)
  // The owner starts beside the lift, not inside its housing or beneath its roof.
  closeRect({ ...floor.elevator, width: 2.2, depth: 2.2 })
  for (const seat of floor.rooms.flatMap((room) => room.seats)) {
    const ahead = { x: Math.sin(seat.heading), z: Math.cos(seat.heading) }
    const half = DESK_M.width / 2
    mark(seat, 1)
    const deskReach = DESK_REACH * FURNITURE_SCALE
    for (const reach of [deskReach - DESK_M.depth / 2, deskReach, deskReach + DESK_M.depth / 2]) {
      const centre = { x: seat.x + ahead.x * reach, z: seat.z + ahead.z * reach }
      closeLine(
        { x: centre.x - ahead.z * half, z: centre.z + ahead.x * half },
        { x: centre.x + ahead.z * half, z: centre.z - ahead.x * half }
      )
    }
  }
  const walled: DooredRect[] = [
    ...flatten(floor.zones).filter((zone) => !floor.buildingId || zone.kind !== 'project'),
    ...floor.rooms
  ].flatMap((zone) => (zone.door ? [{ ...zone, door: zone.door }] : []))
  for (const zone of walled) {
    // Rasterize the rendered gap, rather than clearing doors through unrelated walls or solids.
    for (const segment of roomWallSegments({ ...zone, id: 'walk-wall' })) {
      const halfX = (segment.normalZ * segment.length) / 2
      const halfZ = (segment.normalX * segment.length) / 2
      closeLine(
        { x: segment.x - halfX, z: segment.z - halfZ },
        { x: segment.x + halfX, z: segment.z + halfZ }
      )
    }
  }

  const blocked: string[] = []
  closed.forEach((isClosed, index) => {
    if (isClosed) blocked.push(`${index % width},${Math.floor(index / width)}`)
  })
  return {
    grid: { width, height, cellSize: WALK_CELL_M, origin, blocked },
    isOpen(point) {
      const index = indexOf(point)
      return index >= 0 && closed[index] === 0
    }
  }
}

// The open ground nearest a point: the point itself when the player could stand there.
export function nearestOpen(ground: WalkGround, point: Point): Point | null {
  if (ground.isOpen(point)) return { ...point }
  const { origin, cellSize } = ground.grid
  const column = Math.round((point.x - origin.x) / cellSize)
  const row = Math.round((point.z - origin.z) / cellSize)
  for (let radius = 1; radius <= NEAREST_OPEN_CELLS; radius++) {
    let best: Point | null = null
    let bestDistance = Infinity
    for (let dx = -radius; dx <= radius; dx++)
      for (let dz = -radius; dz <= radius; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue
        const cell = { x: origin.x + (column + dx) * cellSize, z: origin.z + (row + dz) * cellSize }
        const distance = Math.hypot(cell.x - point.x, cell.z - point.z)
        if (distance < bestDistance && ground.isOpen(cell)) {
          best = cell
          bestDistance = distance
        }
      }
    if (best) return best
  }
  return null
}

function hasClearLine(ground: WalkGround, from: Point, to: Point): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / SIGHT_STEP_M))
  for (let step = 1; step < steps; step++) {
    const share = step / steps
    if (
      !ground.isOpen({ x: from.x + (to.x - from.x) * share, z: from.z + (to.z - from.z) * share })
    )
      return false
  }
  return true
}

// The shortest way round walls and through doors, with the grid's stair-steps pulled straight.
// Empty when there is no way. A target inside something solid becomes the open ground beside it.
export function walkPath(ground: WalkGround, from: Point, to: Point): Point[] {
  const target = nearestOpen(ground, to)
  if (!target) return []
  const cells = findPath(ground.grid, from, target)
  if (cells.length < 3) return cells
  const path = [cells[0]]
  for (let anchor = 0; anchor < cells.length - 1; ) {
    let next = anchor + 1
    while (next + 1 < cells.length && hasClearLine(ground, cells[anchor], cells[next + 1])) next++
    path.push(cells[next])
    anchor = next
  }
  return path
}

// Just outside a door, facing nothing in particular: where the player waits at an office.
export function doorstep(zone: DooredRect): Point {
  const outward = SIDE_NORMAL[doorSide(zone)]
  return { x: zone.door.x + outward.x * DOORSTEP_M, z: zone.door.z + outward.z * DOORSTEP_M }
}

// What is underfoot: the slab on the plate, the town's ground everywhere else.
export function groundHeight(floor: FloorGeometry, point: Point): number {
  return contains(floor, { ...point, width: 0, depth: 0 })
    ? (floor.elevation ?? 0)
    : floor.buildingId
      ? 0
      : GROUND_Y
}
