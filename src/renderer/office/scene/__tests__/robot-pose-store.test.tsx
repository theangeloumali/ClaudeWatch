import { render } from '@testing-library/react'
import { createElement } from 'react'
import { Euler, Vector3 } from 'three'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { officePoses } from '../../../office-live/pose-store'
import { makeAgent } from '../../__tests__/fixtures'
import { themeForTeam } from '../../themes/registry'
import { Robot } from '../Robot'

type FrameCallback = (state: { clock: { elapsedTime: number } }, delta: number) => void
const frames = vi.hoisted(() => ({ callbacks: [] as FrameCallback[] }))

// react-dom stands in for the canvas: the frame loop is driven by hand, and the effect that
// seeds three.js objects is skipped.
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useLayoutEffect: () => undefined
}))
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: FrameCallback) => void frames.callbacks.push(callback)
}))
vi.mock('../textures', () => ({ blobShadowTexture: () => null }))
vi.mock('../../themes/rig', () => ({
  useRobotRig: () => ({ body: { current: {} } }),
  applyModelPose: () => undefined
}))

beforeEach(() => {
  frames.callbacks.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  officePoses.retain(new Set())
  vi.restoreAllMocks()
})

it('eases toward the pose store, not the position its frame carried (perf-2)', () => {
  const agent = makeAgent({ agentKey: 'walker', x: 0, z: 0 })
  officePoses.write('walker', { x: 10, z: 4, heading: 1, elevation: 0 })
  const theme = { ...themeForTeam(), robot: { ...themeForTeam().robot, Model: () => null } }
  const robot = createElement(Robot, {
    agent,
    theme,
    rosterIndex: 0,
    isSelected: false,
    isSpeaking: false,
    isReducedMotion: true,
    onSelect: () => undefined,
    onFly: () => undefined
  })
  const { container } = render(robot)
  // The groups react-dom drew get the transform fields three.js would give them.
  for (const group of container.querySelectorAll('group'))
    Object.assign(group, {
      position: new Vector3(),
      rotation: new Euler(),
      scale: new Vector3(1, 1, 1)
    })
  const root = container.querySelector('group') as unknown as { position: Vector3 }

  for (const callback of frames.callbacks) callback({ clock: { elapsedTime: 0 } }, 0.1)

  expect(root.position.x).toBeGreaterThan(1)
  expect(root.position.z).toBeGreaterThan(0.4)
})
