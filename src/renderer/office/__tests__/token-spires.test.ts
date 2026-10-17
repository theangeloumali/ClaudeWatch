import { describe, expect, it } from 'vitest'
import {
  milestoneStep,
  SPIRE_MAX_M,
  SPIRE_MAX_STAGES,
  spireHeight,
  stageFor
} from '../logic/token-spires'

// Seeded, so a failure names the same totals every run.
function nonDecreasingTotals(count: number, seed: number): number[] {
  let state = seed
  const next = (): number => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
    return state / 2_147_483_648
  }
  const totals: number[] = []
  let total = 0
  for (let index = 0; index < count; index++) {
    total += next() < 0.3 ? 0 : Math.floor(next() * 600_000)
    totals.push(total)
  }
  return totals
}

describe('stageFor', () => {
  it('stageFor is 0 below 1M and adds one stage per 1-2-5 step', () => {
    expect(stageFor(null)).toBe(0)
    expect(stageFor(0)).toBe(0)
    expect(stageFor(999_999)).toBe(0)
    expect(stageFor(1e6)).toBe(1)
    expect(stageFor(1_999_999)).toBe(1)
    expect(stageFor(2e6)).toBe(2)
    expect(stageFor(5e6)).toBe(3)
    expect(stageFor(1e7)).toBe(4)
    expect(stageFor(2e7)).toBe(5)
    expect(stageFor(5e7)).toBe(6)
    expect(stageFor(1e9)).toBe(SPIRE_MAX_STAGES)
  })

  it('a stage never falls while the day’s total rises or holds', () => {
    const totals = nonDecreasingTotals(200, 7)
    // The precondition the rule depends on: the totals cross stages without hitting the cap.
    expect(stageFor(totals.at(-1) ?? 0)).toBeGreaterThan(1)
    expect(stageFor(totals.at(-1) ?? 0)).toBeLessThan(SPIRE_MAX_STAGES)
    let previous = 0
    for (const total of totals) {
      const stage = stageFor(total)
      expect(stage).toBeGreaterThanOrEqual(previous)
      previous = stage
    }
  })

  it('counts milestones past the spire cap, so a 100M crossing still reads as a step', () => {
    expect(milestoneStep(1e8)).toBe(7)
    expect(milestoneStep(2e8)).toBe(8)
    expect(milestoneStep(Number.POSITIVE_INFINITY)).toBe(0)
    expect(milestoneStep(Number.NaN)).toBe(0)
  })
})

describe('spireHeight', () => {
  it('the tallest spire stays inside the scene box headroom', () => {
    expect(spireHeight(0)).toBe(0)
    expect(spireHeight(1)).toBeGreaterThan(0)
    expect(spireHeight(2)).toBeGreaterThan(spireHeight(1))
    expect(spireHeight(stageFor(1e15))).toBeLessThanOrEqual(SPIRE_MAX_M)
    expect(spireHeight(99)).toBe(SPIRE_MAX_M)
    expect(spireHeight(-3)).toBe(0)
  })
})
