import { describe, expect, it } from 'vitest'
import { BODY_BLOCKED_LIMIT_SEC, MovementRecovery } from '../movement-recovery'

const LIMIT_TICKS = BODY_BLOCKED_LIMIT_SEC * 10

function blockedTicks(
  recovery: MovementRecovery,
  ticks: number,
  step: (tick: number) => { remaining: number; hasYielded?: boolean; waypointX?: number }
): number | null {
  for (let tick = 1; tick <= ticks; tick++) {
    const { remaining, hasYielded = true, waypointX = 0 } = step(tick)
    const result = recovery.record({
      id: 'walker',
      position: { x: 0, z: 0 },
      waypoint: { x: waypointX, z: 1 },
      hasYielded,
      remaining
    })
    if (result.isBodyBlocked) return tick
    if (result.canRepath) recovery.retried('walker')
  }
  return null
}

describe('body-blocked bound (seating-2)', () => {
  it('trips after 15 s of yielding without path progress, repaths and new waypoints included', () => {
    const trippedAt = blockedTicks(new MovementRecovery(), 300, (tick) => ({
      remaining: 8,
      waypointX: tick % 10 === 0 ? tick : 0
    }))
    expect(trippedAt).toBe(LIMIT_TICKS)
  })

  it('restarts the count when the walker gains half a metre on its route', () => {
    const trippedAt = blockedTicks(new MovementRecovery(), 400, (tick) => ({
      remaining: tick >= 100 ? 7.4 : 8
    }))
    expect(trippedAt).toBe(100 + LIMIT_TICKS)
  })

  it('ignores jitter and a detour that lengthens the route', () => {
    const trippedAt = blockedTicks(new MovementRecovery(), 300, (tick) => ({
      remaining: tick === 40 ? 14 : 8 + (tick % 2) * 0.3
    }))
    expect(trippedAt).toBe(LIMIT_TICKS)
  })

  it('counts only ticks where the walker had to yield', () => {
    const trippedAt = blockedTicks(new MovementRecovery(), 300, (tick) => ({
      remaining: 8,
      hasYielded: tick % 2 === 0
    }))
    expect(trippedAt).toBe(LIMIT_TICKS * 2)
  })
})
