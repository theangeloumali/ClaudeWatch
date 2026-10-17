import { SPIRE_MAX_M, SPIRE_MAX_STAGES } from '../logic/token-spires'
import { box, type PartSpec } from './parts'
import type { OfficeTheme } from './types'

const MODULE_M = SPIRE_MAX_M / SPIRE_MAX_STAGES
const MAST_WIDTH_M = 0.35
// Widest at the base, so a one-stage spire still reads as the foot of a taller one.
const BASE_WIDTH_M = 1.6
const TOP_WIDTH_M = 0.5

function moduleColors({ id, palette }: OfficeTheme): readonly [string, string] {
  if (id === 'neo-edo-steam' || id === 'samurai-empire') return [palette.wood, palette.brass]
  if (id === 'corporate-city') return [palette.brass, palette.glow]
  return [palette.gold, palette.stone]
}

// One plain box per stage, base at y 0, stacked to SPIRE_MAX_M: unit boxes join the crown's
// batch, and the shell scales the stack to the eased height.
export function spireModules(theme: OfficeTheme): PartSpec[] {
  const colors = moduleColors(theme)
  const taper = (BASE_WIDTH_M - TOP_WIDTH_M) / (SPIRE_MAX_STAGES - 1)
  return Array.from({ length: SPIRE_MAX_STAGES }, (_, stage) => {
    const width = BASE_WIDTH_M - stage * taper
    return box([0, (stage + 0.5) * MODULE_M, 0], [width, MODULE_M, width], colors[stage % 2])
  })
}

// From the crown deck up to the spire base: a crown whose top is off-centre leaves no gap.
export function spireMast(
  deck: { x: number; y: number; z: number },
  baseY: number,
  theme: OfficeTheme
): PartSpec[] {
  const height = baseY - deck.y
  if (height <= 0) return []
  return [
    box(
      [deck.x, deck.y + height / 2, deck.z],
      [MAST_WIDTH_M, height, MAST_WIDTH_M],
      theme.palette.lacquer
    )
  ]
}
