import { cardSafeArea } from '../logic/zone-framing'

interface ScreenArea {
  left: number
  right: number
  top: number
  bottom: number
}

// The player stays this far inside the part of the view the HUD leaves free, so the agent it
// walks up to is in view as well.
const FOLLOW_MARGIN_M = 2.5
const FOLLOW_MARGIN_PX = { min: 48, max: 160 }
// After the owner pans away, the camera sweeps back to a walking player instead of cutting.
const FOLLOW_PX_PER_SEC = 2400

// How far, in screen pixels, the camera must move to bring the player back inside `area` less
// `margin`. Zero while the player is inside, so a pan the owner makes is left alone.
export function followShift(
  player: { x: number; y: number },
  area: ScreenArea,
  margin: number
): { x: number; y: number } {
  const along = (value: number, low: number, high: number): number => {
    if (high - low < margin * 2) return value - (low + high) / 2
    if (value < low + margin) return value - (low + margin)
    return value > high - margin ? value - (high - margin) : 0
  }
  return {
    x: along(player.x, area.left, area.right),
    y: along(player.y, area.top, area.bottom)
  }
}

interface FollowFrame {
  // Where the player is drawn, in pixels.
  onScreen: { x: number; y: number }
  viewport: { width: number; height: number }
  zoom: number
  deltaSec: number
  isReducedMotion: boolean
  insets?: Parameters<typeof cardSafeArea>[1]
  isCameraManuallyOwned?: boolean
}

// This frame's camera move, in metres along screen-right and screen-down. `isSettled` is false
// while more of the sweep is left, which is the only time following needs another frame.
export function followStep(frame: FollowFrame): {
  right: number
  down: number
  isSettled: boolean
} {
  if (frame.isCameraManuallyOwned) return { right: 0, down: 0, isSettled: true }
  const margin = Math.min(
    FOLLOW_MARGIN_PX.max,
    Math.max(FOLLOW_MARGIN_PX.min, FOLLOW_MARGIN_M * frame.zoom)
  )
  const area = cardSafeArea(frame.viewport, frame.insets)
  const shift = followShift(frame.onScreen, { ...area, top: frame.insets?.top ?? area.top }, margin)
  const reach = Math.hypot(shift.x, shift.y)
  if (reach === 0) return { right: 0, down: 0, isSettled: true }
  const limit = frame.isReducedMotion ? reach : Math.min(reach, FOLLOW_PX_PER_SEC * frame.deltaSec)
  return {
    right: ((shift.x / reach) * limit) / frame.zoom,
    down: ((shift.y / reach) * limit) / frame.zoom,
    isSettled: limit === reach
  }
}
