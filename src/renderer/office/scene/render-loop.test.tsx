import { render } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { cityClock } from '../logic/city-clock'
import { QUALITY_SETTINGS } from '../logic/quality'
import { chooseQuality, pinQuality, readQuality } from '../quality-store'
import type { BoostSource } from '../logic/frame-governor'
import { FrameGovernor } from './RenderLoop'

const APPLE_RENDERER = 'ANGLE (Apple, Apple M2 Pro)'

const { surface, frame, graphics, draw, FakeControls } = vi.hoisted(() => {
  class FakeControls {
    // camera-controls' own flag: false once the camera has come to rest.
    active = true
    private readonly listeners = new Set<() => void>()
    addEventListener(_type: string, listener: () => void): void {
      this.listeners.add(listener)
    }
    removeEventListener(_type: string, listener: () => void): void {
      this.listeners.delete(listener)
    }
    emitUpdate(): void {
      this.listeners.forEach((listener) => listener())
    }
  }
  const graphics = { renderer: '' }
  // The canvas's own request for a frame; the store's `invalidate` starts out as this.
  const draw = vi.fn<(frames?: number) => void>()
  const surface = {
    invalidate: draw as (frames?: number) => void,
    set: (partial: { invalidate: (frames?: number) => void }): void => {
      surface.invalidate = partial.invalidate
    },
    controls: new FakeControls(),
    gl: {
      getContext: () => ({
        getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 0x9246 }),
        getParameter: (parameter: number) => (parameter === 0x9246 ? graphics.renderer : null)
      })
    }
  }
  return {
    FakeControls,
    graphics,
    draw,
    surface,
    // One subscription per priority, run lowest first as R3F does.
    frame: { byPriority: new Map<number, (state: object, deltaSec: number) => void>() }
  }
})
const cameraBoosts = vi.hoisted(() => ({ count: 0 }))
vi.mock('../logic/frame-governor', async (original) => {
  const actual = await original<typeof import('../logic/frame-governor')>()
  return {
    ...actual,
    startFrameGovernor: (...args: Parameters<typeof actual.startFrameGovernor>) => {
      const governor = actual.startFrameGovernor(...args)
      const boost = governor.boost
      governor.boost = (source?: BoostSource) => {
        if (source === 'camera') cameraBoosts.count += 1
        boost(source)
      }
      return governor
    }
  }
})
vi.mock('@react-three/drei', () => ({ CameraControlsImpl: FakeControls }))
vi.mock('@react-three/fiber', () => ({
  useThree: (selector: (state: typeof surface) => object) => selector(surface),
  useFrame: (callback: (state: object, deltaSec: number) => void, priority = 0) => {
    frame.byPriority.set(priority, callback)
  }
}))

const PACE = QUALITY_SETTINGS.full

function drawFrame(deltaSec = 1 / 30): void {
  const priorities = [...frame.byPriority.keys()].sort((a, b) => a - b)
  for (const priority of priorities) frame.byPriority.get(priority)?.({}, deltaSec)
}

// Whether a rendered frame asks for the next one, which is what keeps the canvas at display rate.
function keepsRendering(): boolean {
  draw.mockClear()
  drawFrame()
  return draw.mock.calls.length > 0
}

beforeEach(() => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(8)
  surface.invalidate = draw
  surface.controls.active = true
  cameraBoosts.count = 0
  graphics.renderer = APPLE_RENDERER
  pinQuality('auto')
  chooseQuality('full')
})

it('ticks the city clock once per drawn frame, ahead of every layer', () => {
  const wall = vi.spyOn(Date, 'now').mockReturnValue(5_000)
  render(<FrameGovernor pace={PACE} agents={[]} />)
  drawFrame()
  const clockMs = cityClock.now()
  wall.mockRestore()
  expect(clockMs).toBe(5_000)
  // Every scene layer subscribes at priority 0, so a negative one runs before all of them.
  expect(Math.min(...frame.byPriority.keys())).toBeLessThan(0)
})

it('leaves the idle rate to the governor when nothing is happening', () => {
  render(<FrameGovernor pace={PACE} agents={[]} />)
  expect(keepsRendering()).toBe(false)
})

it('renders every frame while the wheel, a key or a pressed pointer is active', () => {
  render(<FrameGovernor pace={PACE} agents={[]} />)
  window.dispatchEvent(new WheelEvent('wheel'))
  expect(keepsRendering()).toBe(true)
})

it('does not boost for a pointer that only hovers', () => {
  render(<FrameGovernor pace={PACE} agents={[]} />)
  window.dispatchEvent(new MouseEvent('pointermove', { buttons: 0 }))
  expect(keepsRendering()).toBe(false)
  window.dispatchEvent(new MouseEvent('pointermove', { buttons: 1 }))
  expect(keepsRendering()).toBe(true)
})

it('leaves a camera that moves by itself, as in a fly-to, to the governor: 60 a second', () => {
  render(<FrameGovernor pace={PACE} agents={[]} />)
  surface.controls.emitUpdate()
  expect(keepsRendering()).toBe(false)
})

// Damping keeps camera-controls updating for seconds after it looks still; that tail is not paced at 60.
it('stops pacing a camera at 60 once it has come to rest', () => {
  render(<FrameGovernor pace={PACE} agents={[]} />)
  surface.controls.emitUpdate()
  expect(cameraBoosts.count).toBe(1)
  surface.controls.active = false
  surface.controls.emitUpdate()
  expect(cameraBoosts.count).toBe(1)
})

it('falls back to the idle rate 400 ms after the last input', () => {
  const now = vi.spyOn(performance, 'now').mockReturnValue(1000)
  render(<FrameGovernor pace={PACE} agents={[]} />)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }))
  now.mockReturnValue(1399)
  expect(keepsRendering()).toBe(true)
  now.mockReturnValue(1401)
  expect(keepsRendering()).toBe(false)
})

it('holds a frame asked for by anything else to its own rate', () => {
  render(<FrameGovernor pace={PACE} agents={[]} />)
  draw.mockClear()
  // What the camera controls do on every update, and the canvas on every React commit.
  surface.invalidate()
  expect(draw).not.toHaveBeenCalled()
})

it('lets such a frame through while the hand of the owner is on the Office', () => {
  render(<FrameGovernor pace={PACE} agents={[]} />)
  window.dispatchEvent(new WheelEvent('wheel'))
  draw.mockClear()
  surface.invalidate()
  expect(draw).toHaveBeenCalledTimes(1)
})

it('hands the canvas its own way of asking for a frame back when it unmounts', () => {
  const { unmount } = render(<FrameGovernor pace={PACE} agents={[]} />)
  expect(surface.invalidate).not.toBe(draw)
  unmount()
  expect(surface.invalidate).toBe(draw)
})

it('starts a machine that renders in software at the light level', () => {
  graphics.renderer = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)'
  render(<FrameGovernor pace={PACE} agents={[]} />)
  expect(readQuality().chosen).toBe('light')
})

it('steps the level down when the frames it draws keep arriving late', () => {
  // Later than any real clock reading an earlier test left in the store: on a loaded machine
  // this file can start more than eight seconds into the process.
  const startMs = 1e9
  const now = vi.spyOn(performance, 'now').mockReturnValue(startMs)
  render(<FrameGovernor pace={PACE} agents={[]} />)
  // Asked for the idle rate, drawing at a third of it, for eight seconds.
  const lateSec = 3 / PACE.idleFps
  for (let timeSec = lateSec; timeSec <= 8; timeSec += lateSec) {
    now.mockReturnValue(startMs + timeSec * 1000)
    drawFrame(lateSec)
  }
  expect(readQuality().chosen).toBe('balanced')
})

it('does not judge the machine by frames drawn in the background', () => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  const now = vi.spyOn(performance, 'now').mockReturnValue(0)
  render(<FrameGovernor pace={PACE} agents={[]} />)
  for (let timeSec = 0.5; timeSec <= 10; timeSec += 0.5) {
    now.mockReturnValue(timeSec * 1000)
    drawFrame(0.5)
  }
  expect(readQuality().chosen).toBe('full')
})
