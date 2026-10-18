import { render } from '@testing-library/react'
import { Profiler } from 'react'
import type { Matrix4 } from 'three'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CityEvent } from '../../../office-live/city-events'
import { buildingIdOf } from '../../logic/city-signals'
import { getTheme } from '../../themes/registry'
import { workCity } from '../../town/movers.test-utils'
import { MoverLayer } from '../MoverLayer'

type FrameCallback = (state: unknown, deltaSec: number) => void
const frames = vi.hoisted(() => ({ callbacks: [] as FrameCallback[] }))
const live = vi.hoisted(() => ({ events: [] as CityEvent[] }))

// react-dom stands in for the canvas: the frame loop is driven by hand, and the effect that
// seeds three.js objects is skipped.
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useLayoutEffect: () => undefined
}))
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: FrameCallback) => void frames.callbacks.push(callback)
}))
vi.mock('../../quality-store', () => ({
  useQualityChoice: () => ({ pin: 'full', chosen: 'full' }),
  useQualityLevel: () => 'full'
}))
vi.mock('../../../office-live/city-events', () => ({
  cityEvents: { active: () => live.events, version: () => live.events.length }
}))

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined))
afterEach(() => vi.restoreAllMocks())

interface RingFrame {
  // [index, scale] for each ring written this frame.
  writes: [number, number][]
  // [start, count] of each instanceMatrix range uploaded this frame.
  uploads: [number, number][]
}

// The layer drawn by react-dom, its frame loop driven by hand and its rings recorded.
function renderMovers() {
  const city = workCity()
  const counter = { commits: 0 }
  const { container } = render(
    <Profiler id="movers" onRender={() => (counter.commits += 1)}>
      <MoverLayer
        floor={city.floor}
        plan={city.plan}
        floorTheme={getTheme('corporate-city')}
        player={null}
        isReducedMotion={false}
        hasVehicles
      />
    </Profiler>
  )
  // The meshes react-dom drew get the fields three.js would give them.
  const rings: RingFrame = { writes: [], uploads: [] }
  for (const mesh of container.querySelectorAll('instancedmesh')) {
    const isRings = mesh.getAttribute('name') === 'work-trip-rings'
    Object.assign(mesh, {
      instanceMatrix: {
        needsUpdate: false,
        clearUpdateRanges: () => (isRings ? (rings.uploads.length = 0) : undefined),
        addUpdateRange: (start: number, count: number) =>
          isRings ? rings.uploads.push([start, count]) : undefined
      },
      setMatrixAt: (index: number, matrix: Matrix4) => {
        // decompose() reports 1 for a singular matrix; the basis length is the real scale.
        if (isRings) rings.writes.push([index, Math.hypot(...matrix.elements.slice(0, 3))])
      }
    })
  }
  const tick = () => {
    rings.writes.length = 0
    frames.callbacks.forEach((callback) => callback({}, 0.1))
  }
  return { counter, rings, tick }
}

const editCall = (callId: string, atMs: number): CityEvent => ({
  id: `claude:a:dispatch:${callId}`,
  kind: 'dispatch',
  buildingId: buildingIdOf('c_test', 'p_0'),
  sessionKey: 'claude:a',
  category: 'edit',
  atMs
})

beforeEach(() => {
  frames.callbacks.length = 0
  live.events = []
})

it('a dispatched trip causes no React commit', () => {
  const { counter, rings, tick } = renderMovers()
  const settled = counter.commits
  tick()
  expect(rings.writes.length).toBeGreaterThan(0)
  expect(rings.writes.every(([, scale]) => scale === 0)).toBe(true)

  live.events = [editCall('call-1', Date.now())]
  const scales: number[] = []
  for (let frame = 0; frame < 5; frame++) {
    tick()
    scales.push(...rings.writes.map(([, scale]) => scale))
  }
  // A freight slot set out, ringed on the ground, and React never heard of it.
  expect(scales.filter((scale) => scale === 1)).not.toHaveLength(0)
  expect(counter.commits).toBe(settled)
})

it('while a trip is in flight a frame writes and uploads only its ring', () => {
  const { rings, tick } = renderMovers()
  tick()
  // Clear of the other test's dispatch: the store sends one trip every 2 s at most.
  live.events = [editCall('call-2', Date.now() + 60_000)]
  tick()
  tick()
  const lit = rings.writes.filter(([, scale]) => scale === 1).map(([index]) => index)
  expect(lit).toHaveLength(1)
  expect(rings.writes).toEqual([[lit[0], 1]])
  expect(rings.uploads).toEqual([[lit[0] * 16, 16]])
})
