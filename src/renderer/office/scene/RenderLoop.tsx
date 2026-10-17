import { CameraControlsImpl } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { AgentView } from '../../../shared/office/types'
import { officePoses } from '../../office-live/pose-store'
import type { FrameMetrics } from '../frame-metrics'
import { cityClock } from '../logic/city-clock'
import {
  browserFrameEnv,
  startFrameGovernor,
  type FrameGovernor as Governor,
  type FramePace
} from '../logic/frame-governor'
import { levelForMachine } from '../logic/quality'
import { chooseQuality, machineHints, useQualityLevel, watchQuality } from '../quality-store'

const SMOOTHING = 0.1
const INPUT_EVENTS = ['pointerdown', 'wheel', 'keydown'] as const
const DATASET_INTERVAL_MS = 1000
const CITY_CLOCK_PRIORITY = -1

function rendererOf(context: WebGLRenderingContext | WebGL2RenderingContext): string | undefined {
  const info = context.getExtension('WEBGL_debug_renderer_info')
  const renderer: unknown = info ? context.getParameter(info.UNMASKED_RENDERER_WEBGL) : undefined
  return typeof renderer === 'string' ? renderer : undefined
}

interface FrameGovernorProps {
  // The rates of the detail level in use.
  pace: FramePace
  // Their places are watched: one that changes is an agent walking.
  agents: readonly AgentView[]
}

// Idle, the Office draws at its level's idle rate, and at its walking rate while an agent
// walks. While the owner's hand is on it, or the camera is moving, it draws every display
// frame, and for a moment after so the motion does not end on a stutter.
export function FrameGovernor({ pace, agents }: FrameGovernorProps) {
  // The canvas's own way of asking for a frame, kept from before the gate below replaces it.
  const drawRef = useRef(useThree((state) => state.invalidate))
  const setState = useThree((state) => state.set)
  const controls = useThree((state) => state.controls)
  const gl = useThree((state) => state.gl)
  const governorRef = useRef<Governor | null>(null)
  const poseVersionRef = useRef(officePoses.version())
  const paceRef = useRef(pace)
  paceRef.current = pace

  useEffect(() => {
    const draw = drawRef.current
    const governor = startFrameGovernor(draw, browserFrameEnv(), () => paceRef.current)
    governorRef.current = governor
    // Camera-controls asks for a frame on every update and the canvas on every React commit,
    // which ran a camera re-framing by itself at the display's rate. Those frames wait for the
    // governor's next one unless the owner's hand is on the Office.
    setState({
      invalidate: (frames) => {
        if (governor.isBoosted()) draw(frames)
      }
    })
    const boost = (): void => governor.boost()
    // A pointer that only hovers moves nothing; one with a button down is dragging the camera.
    const onPointerMove = (event: PointerEvent): void => {
      if (event.buttons !== 0) governor.boost()
    }
    const listening = { capture: true, passive: true }
    for (const type of INPUT_EVENTS) window.addEventListener(type, boost, listening)
    window.addEventListener('pointermove', onPointerMove, listening)
    return () => {
      for (const type of INPUT_EVENTS) window.removeEventListener(type, boost, listening)
      window.removeEventListener('pointermove', onPointerMove, listening)
      setState({ invalidate: draw })
      governor.stop()
      governorRef.current = null
    }
  }, [setState])

  useEffect(() => {
    if (!(controls instanceof CameraControlsImpl)) return
    // Damping keeps updates coming for seconds after the camera looks still (`rest`); that
    // tail is drawn at the level's own rate.
    const boost = (): void => {
      if (controls.active) governorRef.current?.boost('camera')
    }
    controls.addEventListener('update', boost)
    return () => controls.removeEventListener('update', boost)
  }, [controls])

  const places = useMemo(
    () => agents.map((agent) => `${agent.agentKey}:${agent.x}:${agent.z}`).join(' '),
    [agents]
  )
  useEffect(() => governorRef.current?.keepMoving(), [places])

  // Software rendering shows only in the renderer's name, which needs a context to read.
  useEffect(() => {
    chooseQuality(levelForMachine(machineHints(rendererOf(gl.getContext()))))
  }, [gl])

  // Below every layer's priority 0, so each reader in a frame sees this frame's time. A
  // negative priority leaves R3F rendering on its own (only a positive one takes it over).
  useFrame(() => cityClock.tick(Date.now()), CITY_CLOCK_PRIORITY)

  // Asking from inside a frame is what chains display-rate frames; the governor alone only
  // asks from its own callback, which can land a frame late.
  useFrame((_, delta) => {
    const governor = governorRef.current
    if (!governor) return
    // A walk reaches the scene through the pose store, not a frame (perf-2).
    if (officePoses.version() !== poseVersionRef.current) {
      poseVersionRef.current = officePoses.version()
      governor.keepMoving()
    }
    if (governor.isBoosted()) drawRef.current()
    // Out of focus the rate is the background's, which says nothing about the machine.
    if (!document.hasFocus()) return
    watchQuality({
      timeMs: performance.now(),
      intervalMs: delta * 1000,
      targetFps: governor.currentFps()
    })
  })
  return null
}

// Writes only the dataset keys whose value changed (ported from ops-twin telemetry-dataset.ts).
function writeDataset(
  element: HTMLElement,
  values: Readonly<Record<string, string>>,
  written: Map<string, string>
): void {
  for (const [key, value] of Object.entries(values)) {
    if (written.get(key) === value) continue
    written.set(key, value)
    element.dataset[key] = value
  }
}

const byteLengthOf = (data: unknown): number => {
  if (typeof data === 'number') return data
  return ArrayBuffer.isView(data) || data instanceof ArrayBuffer ? data.byteLength : 0
}

// A DataView or a plain buffer has no element size: its length is in bytes.
const elementBytesOf = (data: unknown): number =>
  ArrayBuffer.isView(data) &&
  'BYTES_PER_ELEMENT' in data &&
  typeof data.BYTES_PER_ELEMENT === 'number'
    ? data.BYTES_PER_ELEMENT
    : 1

// Sized as the page probe sizes them, so the canvas reads in the same units as its baseline.
// Returns what hands the context its own calls back.
function countBufferUploads(
  context: WebGLRenderingContext | WebGL2RenderingContext,
  onUpload: (bytes: number) => void
): () => void {
  const { bufferData, bufferSubData } = context
  context.bufferData = (...args: unknown[]): void => {
    onUpload(byteLengthOf(args[1]))
    Reflect.apply(bufferData, context, args)
  }
  // A dirty range is sent with its element count; a whole buffer without one.
  context.bufferSubData = (...args: unknown[]): void => {
    const length = args[4]
    onUpload(
      typeof length === 'number' && length > 0
        ? length * elementBytesOf(args[2])
        : byteLengthOf(args[2])
    )
    Reflect.apply(bufferSubData, context, args)
  }
  return () => {
    context.bufferData = bufferData
    context.bufferSubData = bufferSubData
  }
}

// gl.info resets at the start of each render, so reading it in useFrame gives the previous frame's totals.
// frameMs is the interval between frames (what the governor controls), not GPU time.
// P10: the stats also land on the canvas once a second; sampledAtMs shows when a hidden window
// stopped drawing and its stats went stale.
export function MetricsProbe({ metrics }: { metrics: FrameMetrics }) {
  const renderer = useThree((state) => state.gl)
  const quality = useQualityLevel()
  const written = useMemo(() => new Map<string, string>(), [])
  const lastSampleMs = useRef(Number.NEGATIVE_INFINITY)
  const uploadedBytes = useRef(0)
  useEffect(
    () =>
      countBufferUploads(renderer.getContext(), (bytes) => {
        uploadedBytes.current += bytes
      }),
    [renderer]
  )
  useFrame(({ gl }, delta) => {
    if (delta > 0) {
      metrics.frameMs += (delta * 1000 - metrics.frameMs) * SMOOTHING
      metrics.fps = metrics.frameMs > 0 ? 1000 / metrics.frameMs : 0
    }
    metrics.drawCalls = gl.info.render.calls
    metrics.triangles = gl.info.render.triangles
    // Like gl.info's counts, what the previous frame's render sent.
    const uploadBytes = uploadedBytes.current
    uploadedBytes.current = 0
    const nowMs = performance.now()
    if (nowMs - lastSampleMs.current < DATASET_INTERVAL_MS) return
    lastSampleMs.current = nowMs
    writeDataset(
      gl.domElement,
      {
        drawCalls: String(metrics.drawCalls),
        triangles: String(metrics.triangles),
        uploadBytes: String(uploadBytes),
        fps: String(Math.round(metrics.fps)),
        quality,
        sampledAtMs: String(Date.now())
      },
      written
    )
  })
  return null
}
