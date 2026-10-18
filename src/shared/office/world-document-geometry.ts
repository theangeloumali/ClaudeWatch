import { canSweepBody } from './body-sweep'
import { SUBAGENT_BODY_RADIUS, WORKER_BODY_RADIUS } from './body-footprints'
import type {
  WorldDesk,
  WorldFootprint,
  WorldPoint,
  WorldRoom,
  WorldSize
} from './world-document-types'

const EPSILON = 0.001
export function overlaps(first: WorldFootprint, second: WorldFootprint, clearance = 0): boolean {
  return (
    Math.abs(first.x - second.x) < (first.width + second.width) / 2 + clearance - EPSILON &&
    Math.abs(first.z - second.z) < (first.depth + second.depth) / 2 + clearance - EPSILON
  )
}
export function contains(outer: WorldSize, inner: WorldFootprint, clearance = 0): boolean {
  return (
    Math.abs(inner.x) + inner.width / 2 + clearance <= outer.width / 2 + EPSILON &&
    Math.abs(inner.z) + inner.depth / 2 + clearance <= outer.depth / 2 + EPSILON
  )
}
export function edgeDoor(size: WorldSize, door: WorldPoint): boolean {
  const radius = WORKER_BODY_RADIUS
  return (
    (Math.abs(Math.abs(door.x) - size.width / 2) < EPSILON &&
      Math.abs(door.z) + radius <= size.depth / 2) ||
    (Math.abs(Math.abs(door.z) - size.depth / 2) < EPSILON &&
      Math.abs(door.x) + radius <= size.width / 2)
  )
}
export function doorway(size: WorldSize, door: WorldPoint): WorldFootprint {
  const diameter = WORKER_BODY_RADIUS * 2
  const isSideDoor = Math.abs(Math.abs(door.x) - size.width / 2) < EPSILON
  return {
    ...door,
    width: isSideDoor ? diameter * 2 : diameter,
    depth: isSideDoor ? diameter : diameter * 2
  }
}
function deskRadius(desk: WorldDesk): number {
  return desk.id === 'desk_main' ? WORKER_BODY_RADIUS : SUBAGENT_BODY_RADIUS
}
export function deskHasClearance(room: WorldRoom, desk: WorldDesk): boolean {
  const radius = deskRadius(desk)
  const hasWallClearance = contains(room.size, { ...desk, width: radius * 2, depth: radius * 2 })
  const furniture = {
    x: desk.x - Math.sin(desk.heading) * 0.62,
    z: desk.z - Math.cos(desk.heading) * 0.62
  }
  return (
    hasWallClearance &&
    contains(room.size, { ...furniture, width: 0.6, depth: 0.6 }) &&
    room.desks.every(
      (other) =>
        other.id === desk.id ||
        Math.hypot(desk.x - other.x, desk.z - other.z) + EPSILON >= radius + deskRadius(other)
    )
  )
}

export function deskIsReachable(room: WorldRoom, desk: WorldDesk): boolean {
  const radius = deskRadius(desk)
  const halfWidth = room.size.width / 2 - radius
  const halfDepth = room.size.depth / 2 - radius
  if (halfWidth <= 0 || halfDepth <= 0) return false
  const entrance = {
    x: Math.max(-halfWidth, Math.min(halfWidth, room.door.x)),
    z: Math.max(-halfDepth, Math.min(halfDepth, room.door.z))
  }
  const obstacles = room.desks
    .filter((other) => other.id !== desk.id)
    .map((other) => ({ ...other, radius: deskRadius(other) }))
  const isOpen = (position: WorldPoint): boolean =>
    Math.abs(position.x) <= halfWidth + EPSILON && Math.abs(position.z) <= halfDepth + EPSILON
  const canWalk = (from: WorldPoint, to: WorldPoint): boolean =>
    canSweepBody({ body: { id: desk.id, ...from, radius }, to, obstacles, isOpen })
  if (canWalk(entrance, desk)) return true
  // Cap the search work even for a deliberately huge imported room.
  const pitch = Math.max(0.25, room.size.width / 128, room.size.depth / 128)
  const queue: WorldPoint[] = [entrance]
  const seen = new Set<string>(['0,0'])
  for (let cursor = 0; cursor < queue.length && cursor < 65536; cursor++) {
    const from = queue[cursor]
    if (canWalk(from, desk)) return true
    for (const [stepX, stepZ] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      const next = { x: from.x + stepX * pitch, z: from.z + stepZ * pitch }
      const key = `${Math.round((next.x - entrance.x) / pitch)},${Math.round((next.z - entrance.z) / pitch)}`
      if (!seen.has(key) && isOpen(next) && canWalk(from, next)) {
        seen.add(key)
        queue.push(next)
      }
    }
  }
  return false
}
