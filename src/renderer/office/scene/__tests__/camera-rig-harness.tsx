import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { vi } from 'vitest'

// dry-new: camera-rig.test.tsx keeps its mocks inline; new rig specs share these instead.
type FrameCallback = (state: object, deltaSec: number) => void

const camera = { zoom: 34 }
type Point3 = { x: number; y: number; z: number }

function arriveAt(x: number, y: number, z: number, _isAnimated?: boolean): void {
  controls.target = { x, y, z }
}

function readTarget(out: Point3, _isEnd?: boolean): Point3 {
  out.x = controls.target.x
  out.y = controls.target.y
  out.z = controls.target.z
  return out
}
const listeners = new Map<string, Set<() => void>>()
export const frames = new Set<{ current: FrameCallback }>()

export const surface = {
  size: { width: 1440, height: 900 },
  gl: { domElement: document.createElement('canvas') },
  camera,
  invalidate: vi.fn()
}

export const controls = {
  mouseButtons: {} as Record<string, number>,
  touches: {} as Record<string, number>,
  azimuthAngle: 0,
  polarAngle: 0,
  target: { x: 100, y: 0.6, z: 50 },
  // Only a dolly changes it; an orthographic camera never needs one.
  distance: 500,
  stop: vi.fn(),
  minZoom: 3,
  maxZoom: 240,
  truckSpeed: 2,
  draggingSmoothTime: 0.125,
  // Like the library without a transition: the camera is there by the next frame.
  moveTo: vi.fn(arriveAt),
  zoomTo: vi.fn((zoom: number) => {
    camera.zoom = zoom
  }),
  rotateTo: vi.fn(),
  dolly: vi.fn(),
  dollyTo: vi.fn(),
  setLookAt: vi.fn(),
  truck: vi.fn(),
  getTarget: vi.fn(readTarget),
  addEventListener: (type: string, listener: () => void) => {
    if (!listeners.has(type)) listeners.set(type, new Set())
    listeners.get(type)?.add(listener)
  },
  removeEventListener: (type: string, listener: () => void) => {
    listeners.get(type)?.delete(listener)
  },
  emit: (type: string) => listeners.get(type)?.forEach((listener) => listener())
}

export function runFrame(deltaSec = 1 / 60): void {
  for (const frame of frames) frame.current({}, deltaSec)
}

export function resetRig(): void {
  camera.zoom = 34
  surface.size = { width: 1440, height: 900 }
  controls.target = { x: 100, y: 0.6, z: 50 }
  controls.distance = 500
  controls.azimuthAngle = 0
  controls.polarAngle = Math.PI / 4
  vi.clearAllMocks()
  controls.moveTo.mockImplementation(arriveAt)
  controls.getTarget.mockImplementation(readTarget)
}

// As the library holds a fly-to: an animated move sets its end now and the target stays put.
export function holdFlights(): () => Point3 {
  let end = { ...controls.target }
  controls.moveTo.mockImplementation((x, y, z, isAnimated) => {
    end = { x, y, z }
    if (!isAnimated) controls.target = end
  })
  controls.getTarget.mockImplementation((out, isEnd = true) => {
    Object.assign(out, isEnd ? end : controls.target)
    return out
  })
  return () => end
}

export function fiberMock() {
  return {
    useThree: (selector: (state: typeof surface) => object) => selector(surface),
    useFrame: (callback: FrameCallback) => {
      const ref = useRef(callback)
      ref.current = callback
      useEffect(() => {
        frames.add(ref)
        return () => void frames.delete(ref)
      }, [])
    }
  }
}

export function dreiMock() {
  return {
    CameraControlsImpl: {
      ACTION: { TRUCK: 1, NONE: 0, TOUCH_TRUCK: 2, ROTATE: 3, TOUCH_ZOOM_ROTATE: 5 }
    },
    CameraControls: ({ ref }: { ref: Ref<typeof controls> }) => {
      useImperativeHandle(ref, () => controls)
      return null
    }
  }
}
