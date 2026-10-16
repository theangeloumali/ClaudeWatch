import { describe, expect, it } from 'vitest'
import { DEPARTURE_FADE_MS } from '../../../shared/office/types'
import { presenceAfter } from '../scene/Robot'

const FRAME_S = 1 / 60

function settle(fade: number | undefined, isReducedMotion: boolean, seconds: number, from = 1) {
  let presence = from
  for (let elapsed = 0; elapsed < seconds; elapsed += FRAME_S)
    presence = presenceAfter(presence, { fade }, FRAME_S, isReducedMotion)
  return presence
}

describe('robot fade on departure (seating-4)', () => {
  it('shrinks a fading robot to nothing over the sim fade', () => {
    const halfway = settle(0, false, DEPARTURE_FADE_MS / 2000)
    expect(halfway).toBeGreaterThan(0.4)
    expect(halfway).toBeLessThan(0.6)
    expect(settle(0, false, DEPARTURE_FADE_MS / 1000 + FRAME_S)).toBe(0)
  })

  it('keeps a robot whole while it is not fading', () => {
    expect(settle(undefined, false, 1)).toBe(1)
    expect(settle(undefined, false, 1, 0.3)).toBe(1)
  })

  it('does not animate the fade under reduced motion', () => {
    expect(settle(0.6, true, 0.1)).toBe(1)
  })
})
