import { describe, expect, it } from 'vitest'
import { isAtRest } from '../attention'

describe('isAtRest: an agent the game corner may take', () => {
  it.each([
    ['idle with nothing pending', 'idle', 'none', true],
    ['a finished turn, whatever it last did', 'editing', 'done', true],
    ['still working', 'editing', 'none', false],
    ['waiting on its human', 'idle', 'permission', false],
    ['failed', 'idle', 'error', false]
  ] as const)('%s', (_case, activity, attention, isResting) => {
    expect(isAtRest({ activity, attention })).toBe(isResting)
  })
})
