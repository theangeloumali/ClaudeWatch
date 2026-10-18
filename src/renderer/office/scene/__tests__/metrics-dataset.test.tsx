import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createFrameMetrics } from '../../frame-metrics'
import { pinQuality } from '../../quality-store'
import { MetricsProbe } from '../RenderLoop'

interface UploadCalls {
  bufferData: Mock<(...args: unknown[]) => void>
  bufferSubData: Mock<(...args: unknown[]) => void>
}
interface FakeGl {
  info: { render: { calls: number; triangles: number } }
  domElement: HTMLCanvasElement
  getContext: () => UploadCalls
}
const { frame, gl, upload } = vi.hoisted(() => {
  // The renderer's own buffer calls, which the probe counts and passes on.
  const upload: UploadCalls = {
    bufferData: vi.fn<(...args: unknown[]) => void>(),
    bufferSubData: vi.fn<(...args: unknown[]) => void>()
  }
  const gl: FakeGl = {
    info: { render: { calls: 0, triangles: 0 } },
    domElement: document.createElement('canvas'),
    getContext: () => upload
  }
  return {
    upload,
    gl,
    frame: { callback: null as ((state: { gl: FakeGl }, deltaSec: number) => void) | null }
  }
})
vi.mock('@react-three/fiber', () => ({
  useThree: (selector: (state: { gl: FakeGl }) => unknown) => selector({ gl }),
  useFrame: (callback: (state: { gl: FakeGl }, deltaSec: number) => void) => {
    frame.callback = callback
  }
}))

const FRAME_SEC = 1 / 60
const ARRAY_BUFFER = 0x8892
const DYNAMIC_DRAW = 0x88e8
let nowMs = 0
const canvas = gl.domElement
const { bufferData, bufferSubData } = upload

function drawFrame(calls: number, triangles = 1200): void {
  gl.info.render = { calls, triangles }
  frame.callback?.({ gl }, FRAME_SEC)
}

function mount(): ReturnType<typeof render> {
  // Settled at 60 fps, so only the draw counts change between samples.
  return render(<MetricsProbe metrics={{ ...createFrameMetrics(), frameMs: 1000 * FRAME_SEC }} />)
}

beforeEach(() => {
  nowMs = 10_000
  vi.spyOn(performance, 'now').mockImplementation(() => nowMs)
  vi.spyOn(Date, 'now').mockImplementation(() => 1_760_000_000_000 + nowMs)
  for (const key of Object.keys(canvas.dataset)) delete canvas.dataset[key]
  bufferData.mockClear()
  bufferSubData.mockClear()
})
afterEach(() => {
  cleanup()
  pinQuality('auto')
  vi.restoreAllMocks()
})

describe('render stats on the canvas (P10)', () => {
  it('canvas.dataset.drawCalls and sampledAtMs are numbers after one frame', () => {
    pinQuality('balanced')
    mount()
    drawFrame(30)
    expect(Number(canvas.dataset.drawCalls)).toBe(30)
    expect(Number(canvas.dataset.triangles)).toBe(1200)
    expect(Number(canvas.dataset.fps)).toBe(60)
    expect(canvas.dataset.quality).toBe('balanced')
    expect(Number.isFinite(Number(canvas.dataset.sampledAtMs))).toBe(true)
  })

  it('writes at most once a second', () => {
    mount()
    drawFrame(30)
    nowMs += 500
    drawFrame(180)
    expect(canvas.dataset.drawCalls).toBe('30')
    nowMs += 500
    drawFrame(180)
    expect(canvas.dataset.drawCalls).toBe('180')
  })

  it('touches only the keys whose value changed', async () => {
    mount()
    drawFrame(30)
    const changed: string[] = []
    const observer = new MutationObserver((records) =>
      changed.push(...records.map((record) => record.attributeName ?? ''))
    )
    observer.observe(canvas, { attributes: true })
    nowMs += 1000
    drawFrame(31)
    await Promise.resolve()
    observer.disconnect()
    expect(changed.sort()).toEqual(['data-draw-calls', 'data-sampled-at-ms'])
  })
})

describe('upload bytes on the canvas', () => {
  it('canvas.dataset.uploadBytes is a number after one frame', () => {
    mount()
    drawFrame(30)
    expect(Number.isFinite(Number(canvas.dataset.uploadBytes))).toBe(true)
  })

  it('counts the bytes the last frame sent to GPU buffers, as the page probe does', () => {
    mount()
    drawFrame(30)
    // What the renderer sends during the frame that follows: a dirty range, a new buffer and a
    // whole-buffer rewrite.
    const context = gl.getContext()
    context.bufferSubData(ARRAY_BUFFER, 64, new Float32Array(64), 16, 32)
    context.bufferData(ARRAY_BUFFER, new Float32Array(10), DYNAMIC_DRAW)
    context.bufferSubData(ARRAY_BUFFER, 0, new Uint16Array(6))
    nowMs += 1000
    drawFrame(30)
    expect(canvas.dataset.uploadBytes).toBe(String(32 * 4 + 10 * 4 + 6 * 2))
    expect(bufferSubData).toHaveBeenCalledTimes(2)
    expect(bufferData).toHaveBeenCalledWith(ARRAY_BUFFER, expect.any(Float32Array), DYNAMIC_DRAW)
    nowMs += 1000
    drawFrame(30)
    expect(canvas.dataset.uploadBytes).toBe('0')
  })

  it('hands the context its own buffer calls back when it unmounts', () => {
    const { unmount } = mount()
    expect(gl.getContext().bufferSubData).not.toBe(bufferSubData)
    unmount()
    expect(gl.getContext().bufferSubData).toBe(bufferSubData)
    expect(gl.getContext().bufferData).toBe(bufferData)
  })
})
