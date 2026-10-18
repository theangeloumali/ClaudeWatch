export interface PageVisibility {
  isHidden: boolean
  isFocused: boolean
}

export interface VisibilityEnv {
  read(): PageVisibility
  onChange(callback: () => void): () => void
}

// The display's frame clock and a timer, injected so the governor can be driven by hand in tests.
export interface FrameEnv extends VisibilityEnv {
  requestFrame(callback: (timeMs: number) => void): number
  cancelFrame(handle: number): void
  sleep(callback: () => void, delayMs: number): number
  cancelSleep(handle: number): void
  now(): number
}

// The rates of the detail level in use.
export interface FramePace {
  idleFps: number
  walkFps: number
}

// `camera` is a camera that moves by itself (a fly-to, a re-framing); `input` is the owner's hand.
export type BoostSource = 'input' | 'camera'

export interface FrameGovernor {
  // For a short while: input draws every display frame, a camera moving by itself 60 a second
  // (and nothing extra while the page is out of focus).
  boost(source?: BoostSource): void
  // Whether input is holding the display's own rate.
  isBoosted(): boolean
  // An agent or the owner's character is walking: hold the walking rate for a while.
  keepMoving(): void
  // The rate asked for now, leaving a boost aside: what a frame's lateness is judged against.
  currentFps(): number
  stop(): void
}

const FOCUSED_FPS = 30
const BLURRED_FPS = 10
// Out of focus with every agent seated, only idle sway is on screen: measured, a frame costs
// about 1% of a core across the app's processes, whatever is in it.
const BLURRED_IDLE_FPS = 5
const BOOST_HOLD_MS = 400
// Longer than the gap between two position frames of a walk, and than a robot's ease to rest.
const MOVING_HOLD_MS = 1500
// A display frame this close to due counts as due, so 30 fps is exactly every second frame at
// 60 Hz. Kept under a third of a 144 Hz frame, which at 4 ms drew a 60 fps camera at 72.
const DUE_TOLERANCE_MS = 2
// A camera that moves by itself re-frames for seconds at a time; at a 144 Hz display's own rate
// that was the costliest thing the idle Office did.
const CAMERA_FPS = 60
// Waits longer than this are slept through, so the page is not woken on every display frame
// (144 a second on a fast display) to find nothing due.
const SLEEP_OVER_MS = 40
// The sleep ends one 60 Hz frame early, so a late timer still catches the frame that is due.
const SLEEP_MARGIN_MS = 16

const DEFAULT_PACE: FramePace = { idleFps: FOCUSED_FPS, walkFps: FOCUSED_FPS }

export function targetFps(
  visibility: PageVisibility,
  focusedFps = FOCUSED_FPS,
  blurredFps = BLURRED_FPS
): number {
  if (visibility.isHidden) return 0
  return visibility.isFocused ? focusedFps : Math.min(blurredFps, focusedFps)
}

export function browserVisibilityEnv(): VisibilityEnv {
  return {
    read: () => ({
      isHidden:
        typeof document !== 'undefined' &&
        (document.hidden || window.officeBridge?.isVisible?.() === false),
      isFocused: typeof document === 'undefined' || document.hasFocus()
    }),
    onChange: (callback) => {
      if (typeof window === 'undefined') return () => {}
      const stopNative = window.officeBridge?.onVisibilityChanged?.(callback)
      document.addEventListener('visibilitychange', callback)
      window.addEventListener('focus', callback)
      window.addEventListener('blur', callback)
      return () => {
        stopNative?.()
        document.removeEventListener('visibilitychange', callback)
        window.removeEventListener('focus', callback)
        window.removeEventListener('blur', callback)
      }
    }
  }
}

export function browserFrameEnv(): FrameEnv {
  return {
    ...browserVisibilityEnv(),
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (handle) => cancelAnimationFrame(handle),
    sleep: (callback, delayMs) => window.setTimeout(callback, delayMs),
    cancelSleep: (handle) => window.clearTimeout(handle),
    now: () => performance.now()
  }
}

// Drives a frameloop="demand" canvas from the display's own frames: a frame is drawn on the
// display frame it falls due on (a timer alone drifts against vsync), the wait before it is
// slept through, and nothing runs while the page is hidden.
export function startFrameGovernor(
  invalidate: () => void,
  env: FrameEnv,
  pace: () => FramePace = () => DEFAULT_PACE
): FrameGovernor {
  let frameHandle: number | null = null
  let sleepHandle: number | null = null
  let lastInvalidateMs = -Infinity
  let boostUntilMs = -Infinity
  let cameraUntilMs = -Infinity
  let movingUntilMs = -Infinity

  const currentFps = (): number => {
    const { idleFps, walkFps } = pace()
    const isMoving = env.now() < movingUntilMs
    return targetFps(
      env.read(),
      isMoving ? walkFps : idleFps,
      isMoving ? BLURRED_FPS : BLURRED_IDLE_FPS
    )
  }

  const onDisplayFrame = (timeMs: number): void => {
    frameHandle = null
    const paceFps = currentFps()
    if (paceFps === 0) return
    const fps = timeMs < cameraUntilMs ? Math.max(paceFps, CAMERA_FPS) : paceFps
    const isBoosted = timeMs < boostUntilMs
    if (isBoosted || timeMs - lastInvalidateMs >= 1000 / fps - DUE_TOLERANCE_MS) {
      lastInvalidateMs = timeMs
      invalidate()
    }
    const waitMs = lastInvalidateMs + 1000 / fps - timeMs
    if (isBoosted || waitMs <= SLEEP_OVER_MS) frameHandle = env.requestFrame(onDisplayFrame)
    else sleepHandle = env.sleep(wake, waitMs - SLEEP_MARGIN_MS)
  }

  // Also ends a sleep early: input, a walk or regained focus must not wait out an idle gap.
  function wake(): void {
    if (sleepHandle !== null) env.cancelSleep(sleepHandle)
    sleepHandle = null
    if (frameHandle === null && currentFps() > 0) frameHandle = env.requestFrame(onDisplayFrame)
  }

  const stopListening = env.onChange(wake)
  wake()

  return {
    boost: (source = 'input') => {
      if (source === 'input') boostUntilMs = env.now() + BOOST_HOLD_MS
      else if (env.read().isFocused) cameraUntilMs = env.now() + BOOST_HOLD_MS
      wake()
    },
    isBoosted: () => env.now() < boostUntilMs && currentFps() > 0,
    keepMoving: () => {
      movingUntilMs = env.now() + MOVING_HOLD_MS
      wake()
    },
    currentFps,
    stop: () => {
      stopListening()
      if (frameHandle !== null) env.cancelFrame(frameHandle)
      if (sleepHandle !== null) env.cancelSleep(sleepHandle)
      frameHandle = null
      sleepHandle = null
    }
  }
}
