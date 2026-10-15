import type { CameraControlsImpl } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { Vector3 } from 'three'
import { inspectorOwnsKeyboard, isInsideScroller, keyInputFrom } from '../logic/hotkeys'
import {
  releaseVelocity,
  startFling,
  stepFling,
  type Fling,
  type PointerSample
} from '../logic/pan-inertia'
import {
  createWheelClassifier,
  nextZoomGoal,
  wheelInputFrom,
  zoomFactor
} from '../logic/wheel-intent'
import { screenAxes } from '../logic/zone-framing'
import { anchorTruck, easeZoom } from '../logic/zoom-anchor'

const KEY_PAN_PX = 120
const FIT_KEY = '0'
const PAN_KEYS: Record<string, readonly [number, number] | undefined> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1]
}
// A demand-driven canvas can report a long gap as one frame; ease as if it were at most this.
const MAX_FRAME_SEC = 0.05
// Enough pointer history to cover the release-velocity window at 60 Hz.
const MAX_DRAG_SAMPLES = 8
const SCREEN_CENTRE = { x: 0, y: 0 }
// Before the frame subscriber camera-controls registers at -1, so the pose it applies is this frame's.
export const BEFORE_CONTROLS = -2

interface GestureOptions {
  controlsRef: RefObject<CameraControlsImpl | null>
  isReducedMotion: boolean
  // While the owner walks their player the arrow keys are its, not the camera's.
  isWalking: boolean
  // The owner moved the camera by hand (wheel, pinch, scroll, arrow key, zoom key).
  onManualMove: () => void
  onTransition?: () => void
  onFit: () => void
}

export interface CameraGestures {
  // Zoom about the screen centre, eased like a wheel notch.
  zoomBy(factor: number): void
  // Drop any zoom or coast in flight, before a programmatic move takes the camera.
  cancel(): void
}

// OfficeScene's root: the element that holds both the canvas and the name-card layer above it.
export const SCENE_ROOT_SELECTOR = '[data-scene-root]'

interface GestureSurface {
  camera: { readonly zoom: number }
  domElement: HTMLCanvasElement
  invalidate: () => void
  // Read on every event, so a re-render never has to rebuild the listeners.
  latestRef: RefObject<GestureOptions>
}

function createGestureRig({ camera, domElement, invalidate, latestRef }: GestureSurface) {
  const classify = createWheelClassifier()
  const target = new Vector3()
  let zoomGoal: number | null = null
  let cursorOffset = SCREEN_CENTRE
  let fling: Fling | null = null
  let dragSamples: PointerSample[] | null = null

  // Metres along screen-right and screen-down, from where the camera is now rather than where
  // a transition will end: input during a fly-to stops it in place instead of jumping ahead.
  const shiftTarget = (x: number, y: number): void => {
    const controls = latestRef.current.controlsRef.current
    if (!controls) return
    const { right, up } = screenAxes(controls.azimuthAngle, controls.polarAngle)
    controls.getTarget(target, false)
    void controls.moveTo(
      target.x + right[0] * x - up[0] * y,
      target.y + right[1] * x - up[1] * y,
      target.z + right[2] * x - up[2] * y,
      false
    )
  }
  const panPixels = (dx: number, dy: number): void => {
    shiftTarget(dx / camera.zoom, dy / camera.zoom)
    invalidate()
  }
  const zoomAbout = (factor: number, offset: { x: number; y: number }): void => {
    const controls = latestRef.current.controlsRef.current
    if (!controls) return
    const previousGoal = zoomGoal ?? camera.zoom
    latestRef.current.onManualMove()
    zoomGoal = nextZoomGoal(previousGoal, factor, {
      min: controls.minZoom,
      max: controls.maxZoom
    })
    cursorOffset = offset
    invalidate()
  }

  const onWheel = (event: WheelEvent): void => {
    if (event.defaultPrevented || inspectorOwnsKeyboard(event) || isInsideScroller(event.target))
      return
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('input, textarea, select, [contenteditable="true"], [data-camera-guard]'))
      return
    event.preventDefault()
    const input = wheelInputFrom(event, performance.now())
    const intent = classify(input)
    if (intent === 'scroll-pan') {
      fling = null
      latestRef.current.onManualMove()
      return panPixels(event.deltaX, event.deltaY)
    }
    const rect = domElement.getBoundingClientRect()
    zoomAbout(zoomFactor(intent, input), {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2
    })
  }
  const sampleOf = (event: PointerEvent): PointerSample => ({
    timeMs: performance.now(),
    x: event.clientX,
    y: event.clientY
  })
  const onPointerDown = (event: PointerEvent): void => {
    if (event.target === domElement) latestRef.current.onManualMove()
    // A second touch belongs to the native pinch/orbit action, never to a pan fling.
    if (event.pointerType === 'touch' && !event.isPrimary) {
      dragSamples = null
      return
    }
    const isPanStart = event.isPrimary && event.button === 0 && event.target === domElement
    dragSamples = isPanStart ? [sampleOf(event)] : null
  }
  const onPointerMove = (event: PointerEvent): void => {
    if (!dragSamples) return
    dragSamples.push(sampleOf(event))
    if (dragSamples.length > MAX_DRAG_SAMPLES) dragSamples.shift()
  }
  const onPointerUp = (): void => {
    if (!dragSamples) return
    const velocity = releaseVelocity(dragSamples, performance.now())
    dragSamples = null
    if (latestRef.current.isReducedMotion) return
    fling = startFling(velocity)
    if (fling) invalidate()
  }
  const onPointerCancel = (): void => {
    dragSamples = null
    fling = null
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    if (inspectorOwnsKeyboard(event)) return
    fling = null
    const input = keyInputFrom(event)
    if (
      event.defaultPrevented ||
      input.hasModifier ||
      input.isTargetEditable ||
      input.isCameraBlocked
    )
      return
    if (event.key === FIT_KEY) {
      event.preventDefault()
      return latestRef.current.onFit()
    }
    const direction = PAN_KEYS[event.key]
    const controls = latestRef.current.controlsRef.current
    if (!direction || !controls || latestRef.current.isWalking) return
    if (isInsideScroller(event.target)) return
    event.preventDefault()
    latestRef.current.onManualMove()
    const [dx, dy] = [direction[0] * KEY_PAN_PX, direction[1] * KEY_PAN_PX]
    if (latestRef.current.isReducedMotion) return panPixels(dx, dy)
    latestRef.current.onTransition?.()
    void controls.truck(dx / camera.zoom, dy / camera.zoom, true)
  }

  return {
    api: {
      zoomBy: (factor: number) => zoomAbout(factor, SCREEN_CENTRE),
      cancel: () => {
        zoomGoal = null
        fling = null
        dragSamples = null
      }
    } satisfies CameraGestures,
    step(deltaSec: number): void {
      const controls = latestRef.current.controlsRef.current
      if (!controls) return
      const frameSec = Math.min(deltaSec, MAX_FRAME_SEC)
      if (zoomGoal !== null) {
        const next = easeZoom(camera.zoom, zoomGoal, frameSec, latestRef.current.isReducedMotion)
        const truck = anchorTruck(cursorOffset, camera.zoom, next)
        shiftTarget(truck.x, truck.y)
        void controls.zoomTo(next, false)
        if (next === zoomGoal) zoomGoal = null
        invalidate()
      }
      if (fling) {
        const coast = stepFling(fling, frameSec)
        fling = coast.fling
        // The scene follows the hand, so the camera goes the other way.
        panPixels(-coast.dx, -coast.dy)
      }
    },
    listen(): () => void {
      // The scene root, not the canvas: name-card buttons sit above the canvas and would
      // otherwise be dead zones for the wheel.
      const surface = domElement.closest<HTMLElement>(SCENE_ROOT_SELECTOR) ?? domElement
      surface.addEventListener('wheel', onWheel, { passive: false })
      surface.addEventListener('pointerdown', onPointerDown)
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
      window.addEventListener('pointercancel', onPointerCancel)
      window.addEventListener('keydown', onKeyDown)
      return () => {
        surface.removeEventListener('wheel', onWheel)
        surface.removeEventListener('pointerdown', onPointerDown)
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        window.removeEventListener('pointercancel', onPointerCancel)
        window.removeEventListener('keydown', onKeyDown)
      }
    }
  }
}

// The gesture layer over camera-controls: wheel, pinch and trackpad scroll, release inertia and
// the pan and fit keys. camera-controls keeps drag pan, rotate and fly-to.
export function useCameraGestures(options: GestureOptions): CameraGestures {
  const camera = useThree((state) => state.camera)
  const domElement = useThree((state) => state.gl.domElement)
  const invalidate = useThree((state) => state.invalidate)
  const latestRef = useRef(options)
  latestRef.current = options

  const rig = useMemo(
    () => createGestureRig({ camera, domElement, invalidate, latestRef }),
    [camera, domElement, invalidate]
  )

  useEffect(() => rig.listen(), [rig])
  useFrame((_, deltaSec) => rig.step(deltaSec), BEFORE_CONTROLS)
  return rig.api
}
