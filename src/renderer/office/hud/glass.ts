import { prefersReducedMotionNow } from '../logic/city-clock'
import { contrastRatio } from '../themes/contrast'

// Dark ink on a pale chip or skin, white on a deep one, whichever reads better.
export function inkOn(fill: string): string {
  return contrastRatio(fill, '#0b1020') >= contrastRatio(fill, '#ffffff') ? '#0b1020' : '#ffffff'
}

// Campus HUD glass: dark navy over the night scene, a hairline edge, a 10px corner.
export const GLASS_CLASS =
  'rounded-[10px] border border-white/10 bg-[rgba(14,18,32,0.85)] text-white shadow-lg backdrop-blur-sm'

// Secondary text on the glass; white at 70% keeps above 4.5:1 on the navy.
export const GLASS_META_CLASS = 'font-mono text-[11px] text-white/70'

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'

// A short glass nudge (a toast arriving, a count ticking); skipped under reduced motion and
// where WAAPI is missing (jsdom).
export function playGlassMotion(
  element: HTMLElement | null,
  keyframes: Keyframe[],
  durationMs: number
): void {
  if (!element || typeof element.animate !== 'function') return
  if (prefersReducedMotionNow()) return
  element.animate(keyframes, { duration: durationMs, easing: EASE_OUT })
}
