export interface Point {
  x: number
  z: number
}
export interface NavGrid {
  width: number
  height: number
  cellSize: number
  origin: Point
  blocked: string[]
  // Dynamic crowd grids already have a bitmap; static callers retain their string cell keys.
  blockedCells?: Uint8Array
  // The walls alone, under a crowd's bitmap: a walker leaves the crowd over open floor.
  wallCells?: Uint8Array
}

class Frontier {
  private nodes: { id: number; priority: number }[] = []
  push(id: number, priority: number): void {
    const node = { id, priority }
    let index = this.nodes.length
    this.nodes.push(node)
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (this.nodes[parent].priority <= priority) break
      this.nodes[index] = this.nodes[parent]
      index = parent
    }
    this.nodes[index] = node
  }
  pop(): number | undefined {
    const first = this.nodes[0]
    const last = this.nodes.pop()
    if (!first || !last) return undefined
    if (this.nodes.length) {
      let index = 0
      while (index * 2 + 1 < this.nodes.length) {
        let child = index * 2 + 1
        if (
          child + 1 < this.nodes.length &&
          this.nodes[child + 1].priority < this.nodes[child].priority
        )
          child++
        if (last.priority <= this.nodes[child].priority) break
        this.nodes[index] = this.nodes[child]
        index = child
      }
      this.nodes[index] = last
    }
    return first.id
  }
}

const SEARCH_RADIUS_CELLS = 8
const STEPS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1]
] as const

// Cell ids joined to the walker's own over open floor near it; the nearest free cell across a
// wall is no way out (I1). A walker standing in a wall has none, so any free cell will do.
function floorAround(
  [sx, sz]: [number, number],
  width: number,
  isFloor: (x: number, z: number) => boolean
): Set<number> | undefined {
  if (!isFloor(sx, sz)) return undefined
  const queue: [number, number][] = [[sx, sz]]
  const reached = new Set([sz * width + sx])
  for (const [x, z] of queue)
    for (const [dx, dz] of STEPS) {
      const [nx, nz] = [x + dx, z + dz]
      const isNear = Math.max(Math.abs(nx - sx), Math.abs(nz - sz)) <= SEARCH_RADIUS_CELLS
      if (!isNear || !isFloor(nx, nz) || reached.has(nz * width + nx)) continue
      reached.add(nz * width + nx)
      queue.push([nx, nz])
    }
  return reached
}

function nearestFree(
  x: number,
  z: number,
  valid: (x: number, z: number) => boolean
): [number, number] | null {
  for (let radius = 0; radius <= SEARCH_RADIUS_CELLS; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) === radius && valid(x + dx, z + dz))
          return [x + dx, z + dz]
      }
    }
  }
  return null
}

export function findPath(grid: NavGrid, from: Point, to: Point): Point[] {
  const cell = (point: Point) => [
    Math.round((point.x - grid.origin.x) / grid.cellSize),
    Math.round((point.z - grid.origin.z) / grid.cellSize)
  ]
  const [sx, sz] = cell(from),
    [tx, tz] = cell(to)
  const size = grid.width * grid.height
  const blocked = grid.blockedCells ?? new Uint8Array(size)
  if (!grid.blockedCells) {
    for (const key of grid.blocked) {
      const [x, z] = key.split(',').map(Number)
      blocked[z * grid.width + x] = 1
    }
  }
  const isInside = (x: number, z: number) => x >= 0 && z >= 0 && x < grid.width && z < grid.height
  const valid = (x: number, z: number) => isInside(x, z) && !blocked[z * grid.width + x]
  const walls = grid.wallCells ?? blocked
  const joined = valid(sx, sz)
    ? undefined
    : floorAround([sx, sz], grid.width, (x, z) => isInside(x, z) && !walls[z * grid.width + x])
  // A walker can be standing where a later layout built a wall: leave from the nearest free cell.
  const origin = nearestFree(
    sx,
    sz,
    (x, z) => valid(x, z) && (!joined || joined.has(z * grid.width + x))
  )
  if (!origin || !valid(tx, tz)) return []
  const isOnGrid = origin[0] === sx && origin[1] === sz
  const start = origin[1] * grid.width + origin[0],
    target = tz * grid.width + tx
  const costs = new Float64Array(size).fill(Infinity)
  const previous = new Int32Array(size).fill(-1)
  const closed = new Uint8Array(size)
  const open = new Frontier()
  costs[start] = 0
  open.push(start, 0)
  let current: number | undefined
  while ((current = open.pop()) !== undefined) {
    if (closed[current]) continue
    if (current === target) {
      const cells: Point[] = []
      for (let id = target; id !== -1; id = previous[id])
        cells.push({
          x: grid.origin.x + (id % grid.width) * grid.cellSize,
          z: grid.origin.z + Math.floor(id / grid.width) * grid.cellSize
        })
      cells.reverse()
      // The ends are the real points, not their grid cells: seats sit between cells.
      return [{ ...from }, ...cells.slice(isOnGrid ? 1 : 0, -1), { ...to }]
    }
    closed[current] = 1
    const x = current % grid.width,
      z = Math.floor(current / grid.width)
    for (const [dx, dz] of STEPS) {
      const nx = x + dx,
        nz = z + dz,
        next = nz * grid.width + nx
      const cost = costs[current] + 1
      if (!valid(nx, nz) || cost >= costs[next]) continue
      costs[next] = cost
      previous[next] = current
      open.push(next, cost + Math.abs(nx - tx) + Math.abs(nz - tz))
    }
  }
  return []
}
