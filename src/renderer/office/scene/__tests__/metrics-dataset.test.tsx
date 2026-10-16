import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFrameMetrics } from '../../frame-metrics'
import { pinQuality } from '../../quality-store'
import { MetricsProbe } from '../RenderLoop'

interface FakeState {
  gl: { info: { render: { calls: number; triangles: number } }; domElement: HTMLCanvasElement }
}
const { frame } = vi.hoisted(() => ({
  frame: { callback: null as ((state: FakeState, deltaSec: number) => void) | null }
}))
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: (state: FakeState, deltaSec: number) => void) => {
    frame.callback = callback
  }
}))

const FRAME_SEC = 1 / 60
let nowMs = 0
const canvas = document.createElement('canvas')

function drawFrame(calls: number, triangles = 1200): void {
  frame.callback?.(
    { gl: { info: { render: { calls, triangles } }, domElement: canvas } },
    FRAME_SEC
  )
}

function mount(): void {
  // Settled at 60 fps, so only the draw counts change between samples.
  render(<MetricsProbe metrics={{ ...createFrameMetrics(), frameMs: 1000 * FRAME_SEC }} />)
}

beforeEach(() => {
  nowMs = 10_000
  vi.spyOn(performance, 'now').mockImplementation(() => nowMs)
  vi.spyOn(Date, 'now').mockImplementation(() => 1_760_000_000_000 + nowMs)
  for (const key of Object.keys(canvas.dataset)) delete canvas.dataset[key]
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
