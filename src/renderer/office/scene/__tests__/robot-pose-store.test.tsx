import { render } from '@testing-library/react'
import { createElement } from 'react'
import { Euler, Vector3 } from 'three'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { officePoses } from '../../../office-live/pose-store'
import type { AgentView } from '../../../../shared/office/types'
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

function mountRobot(agent: AgentView, isReducedMotion: boolean) {
  const theme = { ...themeForTeam(), robot: { ...themeForTeam().robot, Model: () => null } }
  const robot = createElement(Robot, {
    agent,
    theme,
    rosterIndex: 0,
    isSelected: false,
    isSpeaking: false,
    isReducedMotion,
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
  const [root, presence] = container.querySelectorAll('group') as unknown as {
    position: Vector3
    scale: Vector3
  }[]
  const step = (seconds: number) => {
    for (const callback of frames.callbacks) callback({ clock: { elapsedTime: 0 } }, seconds)
  }
  return { root, presence, step }
}

it('eases toward the pose store, not the position its frame carried (perf-2)', () => {
  officePoses.write('walker', { x: 10, z: 4, heading: 1, elevation: 0 })
  const { root, step } = mountRobot(makeAgent({ agentKey: 'walker', x: 0, z: 0 }), true)
  step(0.1)

  expect(root.position.x).toBeGreaterThan(1)
  expect(root.position.z).toBeGreaterThan(0.4)
})

// FOUND 7: a recalled agent fades out in the street and the sim seats it at its desk.
it('moves a robot faded to nothing straight to its new place, so a recall never streaks', () => {
  officePoses.write('recalled', { x: 40, z: -12, heading: 0, elevation: 0 })
  const { root, presence, step } = mountRobot(
    makeAgent({ agentKey: 'recalled', x: 0, z: 0 }),
    false
  )
  presence.scale.setScalar(0)
  step(1 / 60)

  expect(root.position.x).toBe(40)
  expect(root.position.z).toBe(-12)
  expect(presence.scale.x).toBeGreaterThan(0)
})
