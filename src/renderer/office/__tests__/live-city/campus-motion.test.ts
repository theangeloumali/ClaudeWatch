import { describe, expect, it } from 'vitest'
import {
  arcPoints,
  breath,
  createCampusClock,
  packetSpeedFor,
  rippleAt
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
