import { describe, expect, it } from 'vitest'
import { SEAT_EASE_SEC, seatednessAfter } from '../logic/seat-ease'

describe('seatednessAfter', () => {
  const ease = (from: number, isSeated: boolean, seconds: number, frames = 1): number => {
    let seatedness = from
    for (let frame = 0; frame < frames; frame++)
      seatedness = seatednessAfter(seatedness, isSeated, seconds / frames, false)
    return seatedness
  }

  it('sits over the ease time and stands back over the same time', () => {
    expect(ease(0, true, SEAT_EASE_SEC * 0.9, 9)).toBeLessThan(1)
    expect(ease(0, true, SEAT_EASE_SEC, 10)).toBe(1)
    expect(ease(1, false, SEAT_EASE_SEC * 0.9, 9)).toBeGreaterThan(0)
    expect(ease(1, false, SEAT_EASE_SEC, 10)).toBe(0)
  })

  it('eases out both ways: most of the way in the first half of the time', () => {
    expect(ease(0, true, SEAT_EASE_SEC / 2)).toBeGreaterThan(0.8)
    expect(ease(1, false, SEAT_EASE_SEC / 2)).toBeLessThan(0.2)
  })

  it('gives the same height at 10 fps and 60 fps', () => {
    expect(ease(0, true, 0.1, 1)).toBeCloseTo(ease(0, true, 0.1, 6), 10)
  })

  it('turns back mid-ease from where it is, never faster than a fresh ease', () => {
    const halfSat = ease(0, true, SEAT_EASE_SEC / 3)
    const turned = seatednessAfter(halfSat, false, 0.03, false)
    expect(turned).toBeLessThan(halfSat)
    expect(halfSat - turned).toBeLessThanOrEqual(1 - seatednessAfter(1, false, 0.03, false))
  })

  it('snaps under reduced motion', () => {
    expect(seatednessAfter(0, true, 0.001, true)).toBe(1)
    expect(seatednessAfter(0.4, false, 0.001, true)).toBe(0)
  })
})
