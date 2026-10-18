import { describe, expect, it } from 'vitest'
import { MovementRecovery } from '../movement-recovery'
import type { Point } from '../path'

const START: Point = { x: 0, z: 0 }
const HOME: Point = { x: 6, z: 0 }
const STRAIGHT: Point[] = [{ x: 2, z: 0 }, HOME]
const STEP_METRES = 0.125
// The 12 s a stalled walker waits before its first retry.
const STALL_TICKS = 120
// A passage yield stands aside 8 s at most and the first retry waits 12 s; giving up must
// still come within a few seconds of that.
const GIVES_UP_WITHIN_TICKS = 150

interface Walk {
  // Where the walker stands at this tick, and whether it was held back.
  at: (tick: number) => { position: Point; hasYielded: boolean }
  // The route a retry finds, which starts where the walker stands; none keeps its path.
  replan?: (attempt: number, position: Point) => Point[]
  ticks: number
}

const isAt = (point: Point, position: Point) =>
  Math.hypot(point.x - position.x, point.z - position.z) < 1e-6

// Drives one walker as the world does: reached waypoints drop, and it retries when allowed.
function walk({ at, replan, ticks }: Walk) {
  const recovery = new MovementRecovery()
  let path = STRAIGHT
  let retries = 0
  for (let tick = 1; tick <= ticks; tick++) {
    const { position, hasYielded } = at(tick)
    while (path.length > 1 && isAt(path[0], position)) path = path.slice(1)
    const result = recovery.record({ id: 'walker', position, path, hasYielded })
    if (result.isStuck) return { stuckAtTick: tick, retries }
    if (!result.canRepath) continue
    retries++
    path = replan?.(retries, position) ?? path
    recovery.retried('walker', path)
  }
  return { stuckAtTick: null, retries }
}

const pinned = (position = START) => ({ position, hasYielded: true })
const along = (from: Point, to: Point, steps: number) => ({
  x: from.x + ((to.x - from.x) * steps * STEP_METRES) / Math.hypot(to.x - from.x, to.z - from.z),
  z: from.z + ((to.z - from.z) * steps * STEP_METRES) / Math.hypot(to.x - from.x, to.z - from.z)
})

describe('movement recovery: a walker that never gains ground gives up', () => {
  it('reports a walker stuck when its retries find no way round', () => {
    const { stuckAtTick, retries } = walk({ at: () => pinned(), ticks: 600 })
    expect(retries).toBeGreaterThan(0)
    expect(stuckAtTick).not.toBeNull()
    expect(stuckAtTick).toBeLessThanOrEqual(GIVES_UP_WITHIN_TICKS)
  })

  // Each fresh route starts at a new waypoint, which must not restart the stall clock.
  it('reports it stuck when every retry routes it back into the same jam', () => {
    const { stuckAtTick } = walk({
      at: () => pinned(),
      replan: (attempt, position) => [
        position,
        { x: 1, z: attempt % 2 ? 0.5 : -0.5 },
        { x: 2, z: 0 },
        HOME
      ],
      ticks: 600
    })
    expect(stuckAtTick).not.toBeNull()
    expect(stuckAtTick).toBeLessThanOrEqual(GIVES_UP_WITHIN_TICKS)
  })

  // Pinned 13 s, then 2 m nearer home and pinned there: its count starts over.
  it('starts a walker that gains ground after a retry on a fresh count', () => {
    const ground = { x: 2, z: 0 }
    const walkTicks = 16
    const arrivedTick = 130 + walkTicks
    const { stuckAtTick } = walk({
      at: (tick) =>
        tick <= 130
          ? pinned()
          : pinned(tick >= arrivedTick ? ground : along(START, ground, tick - 130)),
      replan: (_attempt, position) => (isAt(position, START) ? [position, ground, HOME] : [HOME]),
      ticks: 600
    })
    expect(stuckAtTick).toBeGreaterThan(arrivedTick + STALL_TICKS)
  })
})

// Its last waypoint lies inside a seated neighbour's clearance: it slides against the
// neighbour, turned aside nine ticks in ten, and never gains on that waypoint.
it('retries a walker turned aside short of its waypoint within two seconds', () => {
  const recovery = new MovementRecovery()
  let firstRetryTick: number | null = null
  for (let tick = 1; tick <= 120 && firstRetryTick === null; tick++) {
    const position = { x: 0, z: tick % 2 ? 0 : 0.1 }
    const hasYielded = tick % 10 !== 0
    if (recovery.record({ id: 'walker', position, path: STRAIGHT, hasYielded }).canRepath)
      firstRetryTick = tick
  }
  expect(firstRetryTick).not.toBeNull()
  expect(firstRetryTick).toBeLessThanOrEqual(20)
})

describe('movement recovery: walkers that are getting somewhere never give up', () => {
  it('never reports a walker stuck while it walks its route', () => {
    const { stuckAtTick, retries } = walk({
      at: (tick) => ({ position: along(START, HOME, Math.min(48, tick)), hasYielded: false }),
      ticks: 60
    })
    expect({ stuckAtTick, retries }).toEqual({ stuckAtTick: null, retries: 0 })
  })

  it('never reports a walker stuck that yields 8 s and then walks on', () => {
    const { stuckAtTick } = walk({
      at: (tick) =>
        tick <= 80
          ? pinned()
          : { position: along(START, HOME, Math.min(48, tick - 80)), hasYielded: false },
      ticks: 200
    })
    expect(stuckAtTick).toBeNull()
  })

  // A queue's follower yields every other tick and steps on between: it needs no new route.
  it('never retries a walker that gains on its waypoint between yields', () => {
    const { retries } = walk({
      at: (tick) => ({
        position: along(START, HOME, Math.floor(tick / 2)),
        hasYielded: tick % 2 === 0
      }),
      ticks: 90
    })
    expect(retries).toBe(0)
  })

  // A route away from home is still progress while each waypoint comes nearer.
  it('never reports a walker stuck that walks a long way round', () => {
    const recovery = new MovementRecovery()
    const path = [{ x: -40, z: 0 }, HOME]
    const marks: boolean[] = []
    for (let tick = 1; tick <= 300; tick++) {
      const position = { x: -tick * STEP_METRES, z: 0 }
      marks.push(recovery.record({ id: 'walker', position, path, hasYielded: false }).isStuck)
    }
    expect(marks.some(Boolean)).toBe(false)
  })
})
