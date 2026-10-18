import { clamp } from '../../../shared/range'
import { FACADE_LAYER_STEP_M } from '../scene/building-window-parts'

const FIRST_MILESTONE = 1_000_000
const STEP_FACTORS = [1, 2, 5] as const
// 10^18 tokens is far past any day; the bound keeps a corrupt total from looping.
const MAX_MILESTONE_STEPS = 3 * 12

export const SPIRE_MAX_STAGES = 6
export const SPIRE_MODULE_M = 0.8
// The horizon's clip box keeps room for the tallest spire over any roof (markClipBox).
export const SPIRE_MAX_M = SPIRE_MAX_STAGES * SPIRE_MODULE_M
// The spire base clears the crown top, so the two faces never fight (flicker-1).
export const SPIRE_BASE_GAP_M = FACADE_LAYER_STEP_M

// How many 1-2-5 round amounts from 1M a total has reached: 1M, 2M, 5M, 10M, 20M…
export function milestoneStep(tokens: number | null): number {
  if (tokens === null || !Number.isFinite(tokens)) return 0
  let steps = 0
  for (let decade = FIRST_MILESTONE; steps < MAX_MILESTONE_STEPS; decade *= 10) {
    for (const factor of STEP_FACTORS) {
      if (tokens < factor * decade) return steps
      steps += 1
    }
  }
  return steps
}

// The round amount a 1-2-5 step stands for: 1 is 1M, 2 is 2M, 3 is 5M, 4 is 10M.
export function milestoneAmount(step: number): number {
  const decade = 10 ** Math.floor((step - 1) / STEP_FACTORS.length)
  return STEP_FACTORS[(step - 1) % STEP_FACTORS.length] * FIRST_MILESTONE * decade
}

export function stageFor(tokens: number | null): number {
  return Math.min(SPIRE_MAX_STAGES, milestoneStep(tokens))
}

export function spireHeight(stage: number): number {
  return clamp(stage, [0, SPIRE_MAX_STAGES]) * SPIRE_MODULE_M
}
