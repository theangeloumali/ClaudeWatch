import { clamp, type Range } from '../../../shared/range'
import { cardSafeArea, projectToScreen, screenAxes, type ScreenView } from '../logic/zone-framing'

interface ScreenArea {
  left: number
  right: number
  top: number
  bottom: number
}

// The player stays this far inside the part of the view the HUD leaves free, so the agent it
// walks up to is in view as well.
const FOLLOW_MARGIN_M = 2.5
const FOLLOW_MARGIN_PX: Range = [48, 160]
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
export function followSweep(frame: FollowFrame): {
  right: number
  down: number
  isSettled: boolean
} {
  if (frame.isCameraManuallyOwned) return { right: 0, down: 0, isSettled: true }
  const margin = clamp(FOLLOW_MARGIN_M * frame.zoom, FOLLOW_MARGIN_PX)
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

interface BodyFollowFrame extends Omit<FollowFrame, 'onScreen' | 'zoom'> {
  // The followed body: the player, or an agent read from `officePoses`.
  body: { x: number; y: number; z: number }
  view: ScreenView & { polar: number }
}

// The camera target that keeps `body` inside the HUD-safe margin, or null while it is inside.
// It moves the target only, so an orthographic view keeps its zoom and distance (N7).
export function followBody(frame: BodyFollowFrame): {
  target: [number, number, number] | null
  isSettled: boolean
} {
  const step = followSweep({
    ...frame,
    zoom: frame.view.zoom,
    onScreen: projectToScreen(frame.body, frame.view, frame.viewport)
  })
  if (step.right === 0 && step.down === 0) return { target: null, isSettled: step.isSettled }
  const { right, up } = screenAxes(frame.view.azimuth, frame.view.polar)
  const [x, y, z] = frame.view.target
  return {
    target: [
      x + right[0] * step.right - up[0] * step.down,
      y + right[1] * step.right - up[1] * step.down,
      z + right[2] * step.right - up[2] * step.down
    ],
    isSettled: step.isSettled
  }
}
