import { describe, expect, it } from 'vitest'
import {
  arcPoints,
  breath,
  breathScale,
  createCampusClock,
  packetSpeedFor,
  rippleAt,
  runningCountsKey,
  shockwaveAt
} from '../../logic/campus-motion'

describe('campus clock', () => {
  it('follows the scene clock', () => {
    const clock = createCampusClock()
    clock.tick(2.5, false)
    expect(clock.uTime.value).toBe(2.5)
  })

  it('holds still under reduced motion', () => {
    const clock = createCampusClock()
    clock.tick(1, false)
    clock.tick(9, true)
    expect(clock.uTime.value).toBe(1)
  })
})

describe('breath', () => {
  it('stays within 0..1 and returns to its start after a period', () => {
    for (let time = 0; time < 6; time += 0.37) {
      expect(breath(time, 3)).toBeGreaterThanOrEqual(0)
      expect(breath(time, 3)).toBeLessThanOrEqual(1)
    }
    expect(breath(4, 3)).toBeCloseTo(breath(1, 3))
  })
})

describe('rippleAt', () => {
  it('grows outward and fades as it goes', () => {
    const early = rippleAt(0.2, 2, 0)
    const late = rippleAt(1.6, 2, 0)
    expect(late.share).toBeGreaterThan(early.share)
    expect(late.opacity).toBeLessThan(early.opacity)
  })

  it('offsets a second wave by half a period', () => {
    expect(rippleAt(0, 2, 0.5).share).toBeCloseTo(rippleAt(1, 2, 0).share)
  })
})

describe('packetSpeedFor', () => {
  it('keeps an idle road trickling and speeds up for busy rooms, up to a cap', () => {
    expect(packetSpeedFor(0)).toBeGreaterThan(0)
    expect(packetSpeedFor(3)).toBeGreaterThan(packetSpeedFor(1))
    expect(packetSpeedFor(50)).toBe(packetSpeedFor(12))
  })
})

describe('arcPoints', () => {
  it('starts and ends at its ends and rises between them', () => {
    const points = arcPoints({ x: 10, y: 0, z: 0 }, { x: 0, y: 4, z: 0 }, 6, 8)
    expect(points).toHaveLength(9)
    expect(points[0]).toEqual({ x: 10, y: 0, z: 0 })
    expect(points[8]).toEqual({ x: 0, y: 4, z: 0 })
    expect(points[4].y).toBeGreaterThan(4)
  })
})

describe('breathScale', () => {
  it('swells and shrinks the core by four per cent around rest', () => {
    expect(breathScale(0, 4)).toBeCloseTo(0.96)
    expect(breathScale(2, 4)).toBeCloseTo(1.04)
    expect(breathScale(1, 4)).toBeCloseTo(1)
  })
})

describe('shockwaveAt', () => {
  it('starts at the core, fully lit', () => {
    expect(shockwaveAt(0)).toEqual({ share: 0, opacity: 1 })
  })

  it('races out early and fades as it reaches the rim', () => {
    const halfway = shockwaveAt(450)
    expect(halfway?.share).toBeGreaterThan(0.75)
    expect(halfway?.opacity).toBeCloseTo(0.5)
  })

  it('is over once it has reached the rim, and before it starts', () => {
    expect(shockwaveAt(900)).toBeNull()
    expect(shockwaveAt(-1)).toBeNull()
  })
})

describe('runningCountsKey', () => {
  it('names each room and its running count', () => {
    const rooms = [
      { projectKey: 'b', runningCount: 0 },
      { projectKey: 'a', runningCount: 2 }
    ]
    expect(runningCountsKey(rooms)).toBe('a=2,b=0')
  })

  it('does not change when only the order does', () => {
    const first = [
      { projectKey: 'a', runningCount: 1 },
      { projectKey: 'b', runningCount: 3 }
    ]
    expect(runningCountsKey([...first].reverse())).toBe(runningCountsKey(first))
  })

  it('is empty with no rooms', () => {
    expect(runningCountsKey(undefined)).toBe('')
  })
})
