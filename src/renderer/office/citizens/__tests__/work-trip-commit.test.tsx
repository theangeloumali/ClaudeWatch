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
  useQualityChoice: () => ({ pin: 'full', chosen: 'full' })
}))
vi.mock('../../../office-live/city-events', () => ({
  cityEvents: { active: () => live.events, version: () => live.events.length }
}))

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined))
afterEach(() => vi.restoreAllMocks())

it('a dispatched trip causes no React commit', () => {
  const city = workCity()
  let commits = 0
  const { container } = render(
    <Profiler id="movers" onRender={() => (commits += 1)}>
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
  const ringScales: number[] = []
  for (const mesh of container.querySelectorAll('instancedmesh')) {
    const isRings = mesh.getAttribute('name') === 'work-trip-rings'
    Object.assign(mesh, {
      instanceMatrix: { needsUpdate: false },
      setMatrixAt: (_index: number, matrix: Matrix4) => {
        // decompose() reports 1 for a singular matrix; the basis length is the real scale.
        if (isRings) ringScales.push(Math.hypot(...matrix.elements.slice(0, 3)))
      }
    })
  }
  const tick = () => frames.callbacks.forEach((callback) => callback({}, 0.1))
  const settled = commits
  tick()
  expect(ringScales.length).toBeGreaterThan(0)
  expect(ringScales.every((scale) => scale === 0)).toBe(true)

  live.events = [
    {
      id: 'claude:a:dispatch:call-1',
      kind: 'dispatch',
      buildingId: buildingIdOf('c_test', 'p_0'),
      sessionKey: 'claude:a',
      category: 'edit',
      atMs: Date.now()
    }
  ]
  ringScales.length = 0
  for (let frame = 0; frame < 5; frame++) tick()
  // A freight slot set out, ringed on the ground, and React never heard of it.
  expect(ringScales.filter((scale) => scale === 1)).not.toHaveLength(0)
  expect(commits).toBe(settled)
})
