import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCityClock } from './city-clock'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('city clock', () => {
  it('two readers in one frame see the same time', () => {
    const clock = createCityClock(() => false)
    const wall = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    clock.tick(1_000)
    const first = clock.now()
    // Wall time moves on inside the frame; a later reader still sees the frame's time.
    wall.mockReturnValue(1_016)
    expect(clock.now()).toBe(first)
    expect(first).toBe(1_000)
  })

  it('reduced motion pins the clock', () => {
    let isReduced = false
    const clock = createCityClock(() => isReduced)
    clock.tick(1_000)
    expect(clock.isPinned()).toBe(false)
    isReduced = true
    clock.tick(5_000)
    expect(clock.isPinned()).toBe(true)
    expect(clock.now()).toBe(1_000)
    isReduced = false
    clock.tick(9_000)
    expect(clock.isPinned()).toBe(false)
    expect(clock.now()).toBe(9_000)
  })

  it('a 10 s idle gap advances the clock by 10 s, not by frames drawn', () => {
    const clock = createCityClock(() => false)
    clock.tick(1_000)
    clock.tick(1_050)
    const beforeGap = clock.now()
    clock.tick(11_050)
    expect(clock.now() - beforeGap).toBe(10_000)
  })
})
