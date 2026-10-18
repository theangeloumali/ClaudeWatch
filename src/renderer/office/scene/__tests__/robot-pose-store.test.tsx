import { render } from '@testing-library/react'
import { createElement } from 'react'
import { Euler, Vector3 } from 'three'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { officePoses } from '../../../office-live/pose-store'
import type { AgentView } from '../../../../shared/office/types'
import { makeAgent } from '../../__tests__/fixtures'
import { themeForTeam } from '../../themes/registry'
import type { OfficeTheme, ThemePoseOptions } from '../../themes/types'
import { Robot } from '../Robot'

type FrameCallback = (state: { clock: { elapsedTime: number } }, delta: number) => void
const frames = vi.hoisted(() => ({
  callbacks: [] as FrameCallback[],
  poseOptions: [] as ThemePoseOptions[]
}))

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
  applyModelPose: (input: { options: ThemePoseOptions }) =>
    void frames.poseOptions.push(input.options)
}))

beforeEach(() => {
  frames.callbacks.length = 0
  frames.poseOptions.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  officePoses.retain(new Set())
  vi.restoreAllMocks()
})

function mountRobot(agent: AgentView, isReducedMotion: boolean) {
  const robotWith = (Model: OfficeTheme['robot']['Model']) =>
    createElement(Robot, {
      agent,
      theme: { ...themeForTeam(), robot: { ...themeForTeam().robot, Model } },
      rosterIndex: 0,
      isSelected: false,
      isSpeaking: false,
      isReducedMotion,
      onSelect: () => undefined,
      onFly: () => undefined
    })
  const { container, rerender } = render(robotWith(() => null))
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
  // R3F keeps only the latest frame callback a render registered.
  const step = (seconds: number) =>
    frames.callbacks.at(-1)?.({ clock: { elapsedTime: 0 } }, seconds)
  const swapModel = (Model: OfficeTheme['robot']['Model']) => rerender(robotWith(Model))
  return { root, presence, step, swapModel }
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

it("carries one seat ease across a robot's frames, so a sit can span them", () => {
  officePoses.write('sitter', { x: 0, z: 0, heading: 0, elevation: 0 })
  const { step } = mountRobot(makeAgent({ agentKey: 'sitter', x: 0, z: 0 }), false)
  step(0.03)
  step(0.03)

  const [first, second] = frames.poseOptions
  expect(first?.seat).toBeDefined()
  expect(second?.seat).toBe(first?.seat)
})

it("starts the sit afresh when the model is swapped, never in the old model's terms", () => {
  officePoses.write('swapper', { x: 0, z: 0, heading: 0, elevation: 0 })
  const { step, swapModel } = mountRobot(makeAgent({ agentKey: 'swapper', x: 0, z: 0 }), false)
  step(0.03)
  const seat = frames.poseOptions[0]?.seat
  if (seat) seat.seatedness = 1
  step(0.03)
  expect(frames.poseOptions.at(-1)?.seat?.seatedness).toBe(1)

  swapModel(() => null)
  step(0.03)
  expect(frames.poseOptions.at(-1)?.seat?.seatedness).toBeNull()
})
