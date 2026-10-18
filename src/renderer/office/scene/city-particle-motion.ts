import { clamp } from '../../../shared/range'
import type { PlaceTop } from '../logic/building-place'
import { SPIRE_MODULE_M } from '../logic/token-spires'
import { easeOut, screenMetres, type MarkPose } from './city-marks'

// Fireworks: three shells a burst, each rising then blooming (ClearSpent signal-bursts, sim/signals).
const SHELLS = 3
const SHELL_GAP_MS = 275
const RISE_MS = 400
const BLOOM_MS = 1_500
const SPARKS = 12
export const BURST_SPARKS = SHELLS * SPARKS
const APEX_M = 5
const FROZEN_BLOOM = 0.55
const SPARK_PX = 4
const BLOOM_PX = 40
const BLOOM_MIN_M = 2.5
const FALL_M = 1.5
// Each shell opens a little off the last, so a burst reads as three.
const SHELL_OFFSETS = [
  [0, 0],
  [1.6, 0.9],
  [-1.3, 1.4]
] as const

// Smoke: puffs rise and thin in turn, so a column builds up rather than appearing whole.
export const PUFFS = 5
const PUFF_MS = 3_200
const PUFF_RISE_M = 7
const PUFF_PX = 7
const PUFF_MIN_M = 0.7
const SWAY_M = 0.35
const THIN_FROM = 0.75

// Hoist: the crane sets the new stage's module down on the roof over most of the hoist.
const MODULE_WIDTH_M = 1.4
const MODULE_HEIGHT_M = SPIRE_MODULE_M
const HOIST_DROP_M = 3
const HOIST_SET_SHARE = 0.8

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const SPARK_DIRECTIONS = Array.from({ length: SPARKS }, (_, index) => {
  const y = 1 - (2 * (index + 0.5)) / SPARKS
  const ring = Math.sqrt(1 - y * y)
  return { x: Math.cos(index * GOLDEN_ANGLE) * ring, y, z: Math.sin(index * GOLDEN_ANGLE) * ring }
})

interface ShellPart {
  shell: number
  pose: MarkPose
  // 0 while rising, then how far the bloom has opened.
  bloom: number
}

// Every part of one burst at its age; `isPinned` holds a frozen bloom (reduced motion).
export function burstParts(
  top: PlaceTop,
  ageMs: number,
  zoom: number,
  isPinned: boolean
): ShellPart[] {
  const parts: ShellPart[] = []
  const apexY = top.y + APEX_M
  const size = screenMetres(SPARK_PX, zoom)
  const radius = Math.max(BLOOM_MIN_M, screenMetres(BLOOM_PX, zoom))
  for (let shell = 0; shell < SHELLS; shell++) {
    const shellAge = ageMs - shell * SHELL_GAP_MS
    if (!isPinned && (shellAge < 0 || shellAge >= RISE_MS + BLOOM_MS)) continue
    const [dx, dz] = SHELL_OFFSETS[shell]
    const apex = { x: top.x + dx, y: apexY, z: top.z + dz }
    if (!isPinned && shellAge < RISE_MS) {
      const rise = easeOut(shellAge / RISE_MS)
      const x = top.x + dx * rise
      const z = top.z + dz * rise
      const y = top.y + (apexY - top.y) * rise
      parts.push({ shell, bloom: 0, pose: { x, y, z, scaleX: size, scaleY: size, scaleZ: size } })
      continue
    }
    const bloom = isPinned ? FROZEN_BLOOM : (shellAge - RISE_MS) / BLOOM_MS
    const spread = radius * easeOut(bloom)
    const sparkSize = size * Math.sqrt(1 - bloom * bloom)
    for (const direction of SPARK_DIRECTIONS)
      parts.push({
        shell,
        bloom,
        pose: {
          x: apex.x + direction.x * spread,
          y: apex.y + direction.y * spread - FALL_M * bloom * bloom,
          z: apex.z + direction.z * spread,
          scaleX: sparkSize,
          scaleY: sparkSize,
          scaleZ: sparkSize
        }
      })
  }
  return parts
}

// One puff of a site's smoke, or null before its turn; `share` is how far it has risen.
export function puffPose(options: {
  top: PlaceTop
  // The site's own draw for this puff, so neighbouring offices sway apart.
  seed: number
  puff: number
  sinceMs: number
  nowMs: number
  zoom: number
  isPinned: boolean
}): { pose: MarkPose; share: number } | null {
  const { top, puff, zoom, seed } = options
  const bornMs = options.sinceMs + (puff * PUFF_MS) / PUFFS
  if (!options.isPinned && options.nowMs < bornMs) return null
  const share = options.isPinned
    ? (puff + 0.5) / PUFFS
    : ((options.nowMs - bornMs) % PUFF_MS) / PUFF_MS
  const thin = share > THIN_FROM ? (1 - share) / (1 - THIN_FROM) : 1
  const size = Math.max(PUFF_MIN_M, screenMetres(PUFF_PX, zoom)) * (0.6 + share) * thin
  const sway = Math.sin((share + seed) * Math.PI * 2) * SWAY_M
  const y = top.y + size / 2 + PUFF_RISE_M * easeOut(share)
  return {
    share,
    pose: {
      x: top.x + sway,
      y,
      z: top.z + sway * (seed - 0.5),
      scaleX: size,
      scaleY: size,
      scaleZ: size,
      rotationX: seed * Math.PI,
      rotationY: seed * Math.PI * 2
    }
  }
}

// The module the crane sets down: from above the roof onto it, then held there.
export function hoistPose(top: PlaceTop, ageMs: number, lifeMs: number): MarkPose {
  const share = clamp(ageMs / (lifeMs * HOIST_SET_SHARE), [0, 1])
  const landedY = top.y + MODULE_HEIGHT_M / 2
  const y = landedY + HOIST_DROP_M * (1 - easeOut(share))
  return {
    x: top.x,
    y,
    z: top.z,
    scaleX: MODULE_WIDTH_M,
    scaleY: MODULE_HEIGHT_M,
    scaleZ: MODULE_WIDTH_M
  }
}
