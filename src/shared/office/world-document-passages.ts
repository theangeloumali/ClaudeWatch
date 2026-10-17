import { canSweepBody } from './body-sweep'
import { WORKER_BODY_RADIUS } from './body-footprints'
import type { WorldBuilding, WorldPoint, WorldRoom } from './world-document-types'

interface FloorPassages {
  building: WorldBuilding
  rooms: WorldRoom[]
  floorNumber: number
}
export function unreachableFloorTargets({ building, rooms, floorNumber }: FloorPassages): string[] {
  const radius = WORKER_BODY_RADIUS + 0.02
  const halfWidth = building.footprint.width / 2 - radius
  const halfDepth = building.footprint.depth / 2 - radius
  const clamp = (point: WorldPoint): WorldPoint => ({
    x: Math.max(-halfWidth, Math.min(halfWidth, point.x)),
    z: Math.max(-halfDepth, Math.min(halfDepth, point.z))
  })
  const start = clamp(
    floorNumber === 1 ? building.entrance : (building.connector ?? building.entrance)
  )
  const goals: { target: string; x: number; z: number }[] = rooms.map((room) => {
    const isSide = Math.abs(Math.abs(room.door.x) - room.size.width / 2) < 0.001
    return {
      target: room.target,
      x: room.position.x + room.door.x + (isSide ? Math.sign(room.door.x) * radius : 0),
      z: room.position.z + room.door.z + (isSide ? 0 : Math.sign(room.door.z) * radius)
    }
  })
  if (floorNumber === 1 && building.connector)
    goals.push({ target: building.id, x: building.connector.x, z: building.connector.z })
  const obstacles = rooms.map((room) => ({ ...room.position, ...room.size }))
  const isOpen = (point: WorldPoint): boolean => {
    if (Math.abs(point.x) > halfWidth || Math.abs(point.z) > halfDepth) return false
    return obstacles.every((obstacle) => {
      const dx = Math.max(0, Math.abs(point.x - obstacle.x) - obstacle.width / 2)
      const dz = Math.max(0, Math.abs(point.z - obstacle.z) - obstacle.depth / 2)
      return Math.hypot(dx, dz) + 0.001 >= radius
    })
  }
  const canWalk = (from: WorldPoint, to: WorldPoint): boolean =>
    isOpen(from) &&
    canSweepBody({ body: { id: 'validation', ...from, radius }, to, obstacles: [], isOpen })
  const pending = goals.filter((goal) => !canWalk(start, goal))
  if (!pending.length) return []
  const pitch = Math.max(0.25, building.footprint.width / 128, building.footprint.depth / 128)
  const keyOf = (point: WorldPoint): string =>
    `${Math.round((point.x - start.x) / pitch)},${Math.round((point.z - start.z) / pitch)}`
  const destinations = new Map<string, typeof pending>()
  for (const goal of pending) {
    const key = keyOf(goal)
    destinations.set(key, [...(destinations.get(key) ?? []), goal])
  }
  const reached = new Set<string>()
  const queue: WorldPoint[] = [start]
  const seen = new Set<string>([keyOf(start)])
  for (
    let cursor = 0;
    cursor < queue.length && cursor < 65536 && reached.size < pending.length;
    cursor++
  ) {
    const from = queue[cursor]
    // Door clearances rarely land on the lattice; accept a clear final segment from a neighbour.
    for (const offsetX of [-1, 0, 1])
      for (const offsetZ of [-1, 0, 1]) {
        const key = keyOf({ x: from.x + offsetX * pitch, z: from.z + offsetZ * pitch })
        for (const goal of destinations.get(key) ?? [])
          if (!reached.has(goal.target) && canWalk(from, goal)) reached.add(goal.target)
      }
    for (const [stepX, stepZ] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      const next = { x: from.x + stepX * pitch, z: from.z + stepZ * pitch }
      const key = keyOf(next)
      if (!seen.has(key) && isOpen(next) && canWalk(from, next)) {
        seen.add(key)
        queue.push(next)
      }
    }
  }
  return pending.filter((goal) => !reached.has(goal.target)).map((goal) => goal.target)
}
