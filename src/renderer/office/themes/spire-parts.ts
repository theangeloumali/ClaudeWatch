import { SPIRE_MAX_STAGES, SPIRE_MODULE_M } from '../logic/token-spires'
import { FACADE_LAYER_STEP_M } from '../scene/building-window-parts'
import { box, type PartSpec } from './parts'
import type { OfficeTheme } from './types'

// Widest at the base, so a one-stage spire still reads as the foot of a taller one. The base
// passes through the crown, so it sits a layer step off the round widths crown parts land on.
const BASE_WIDTH_M = 1.6 + 2 * FACADE_LAYER_STEP_M
const TOP_WIDTH_M = 0.5

function moduleColors({ id, palette }: OfficeTheme): readonly [string, string] {
  if (id === 'neo-edo-steam' || id === 'samurai-empire') return [palette.wood, palette.brass]
  if (id === 'corporate-city') return [palette.brass, palette.glow]
  return [palette.gold, palette.stone]
}

// One plain box per stage, base at y 0, stacked to SPIRE_MAX_M: unit boxes join the crown's
// batch (+0 draws).
export function spireModules(theme: OfficeTheme): PartSpec[] {
  const colors = moduleColors(theme)
  const taper = (BASE_WIDTH_M - TOP_WIDTH_M) / (SPIRE_MAX_STAGES - 1)
  return Array.from({ length: SPIRE_MAX_STAGES }, (_, stage) => {
    const width = BASE_WIDTH_M - stage * taper
    return box(
      [0, (stage + 0.5) * SPIRE_MODULE_M, 0],
      [width, SPIRE_MODULE_M, width],
      colors[stage % 2]
    )
  })
}

export interface ModuleFrame {
  // Centre above the spire base, and height.
  y: number
  height: number
}

// Each module at an eased spire height: whole below, the top one part-grown, the rest hidden.
// The first reaches `drop` metres down to the crown deck, so an off-centre crown leaves no gap.
export function moduleFrames(heightM: number, drop: number): (ModuleFrame | null)[] {
  return Array.from({ length: SPIRE_MAX_STAGES }, (_, stage) => {
    const shown = Math.min(SPIRE_MODULE_M, heightM - stage * SPIRE_MODULE_M)
    if (shown <= 0) return null
    const bottom = stage === 0 ? -drop : stage * SPIRE_MODULE_M
    const top = stage * SPIRE_MODULE_M + shown
    return { y: (bottom + top) / 2, height: top - bottom }
  })
}
