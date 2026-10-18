import { render } from '@testing-library/react'
import { createElement } from 'react'
import { Euler, Vector3 } from 'three'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { officePoses, poseOf, structuralKey } from '../../../office-live/pose-store'
import type { AgentView } from '../../../../shared/office/types'
import { themeForTeam } from '../../themes/registry'
import { Robot } from '../Robot'
import { CityWorld, observed } from '../../../../office/sim/__tests__/city-harness'
import { LOUNGE_DELAY_MS } from '../../../../office/sim/behaviour'

type FrameCallback = (state: { clock: { elapsedTime: number } }, delta: number) => void
const frames = vi.hoisted(() => ({ callbacks: [] as FrameCallback[] }))
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

const KEY = 'claude:idle'

function mount(agent: AgentView) {
  const theme = { ...themeForTeam(), robot: { ...themeForTeam().robot, Model: () => null } }
  const robotFor = (view: AgentView) =>
    createElement(Robot, {
      agent: view,
      theme,
      rosterIndex: 0,
      isSelected: false,
      isSpeaking: false,
      isReducedMotion: false,
      onSelect: () => undefined,
      onFly: () => undefined
    })
  const { container, rerender } = render(robotFor(agent))
  for (const group of container.querySelectorAll('group'))
    Object.assign(group, {
      position: new Vector3(),
      rotation: new Euler(),
      scale: new Vector3(1, 1, 1)
    })
  const [root, presence] = [...container.querySelectorAll('group')] as unknown as {
    position: Vector3
    scale: Vector3
  }[]
  root.position.set(agent.x, agent.elevation ?? 0, agent.z)
  return { root, presence, show: (view: AgentView) => rerender(robotFor(view)) }
}

it('never draws a flapped gamer moving while it can be seen', () => {
  const city = new CityWorld((now) => [observed(KEY, 'p_a', now)])
  let seated: AgentView | undefined
  city.run(
    LOUNGE_DELAY_MS + 30_000,
    (views) => void (seated = views.find((v) => v.agentKey === KEY))
  )
  expect(seated?.place).toBe('lounge')
  officePoses.write(KEY, poseOf(seated!))
  const { root, presence, show } = mount(seated!)
  let lastKey = structuralKey([seated!])
  let drawnWhileVisible = 0
  // The drawn size at each teleport: it should already have shrunk away, not pop out.
  const jumpScales: number[] = []
  const tick = () => {
    // As live-feed does: poses every tick, the agent prop only when its structure changes.
    const view = city.step().find((v) => v.agentKey === KEY)!
    officePoses.write(KEY, poseOf(view))
    const key = structuralKey([view])
    if (key !== lastKey) show(view)
    lastKey = key
    for (let i = 0; i < 6; i++) {
      const before = root.position.clone()
      const scaleBefore = presence.scale.x
      frames.callbacks.at(-1)?.({ clock: { elapsedTime: 0 } }, 1 / 60)
      const step = before.distanceTo(root.position)
      // A glide: drawn at both ends of a small step. A one-frame jump is a teleport, counted apart.
      if (scaleBefore > 0 && presence.scale.x > 0 && step < 1) drawnWhileVisible += step
      if (step >= 1) jumpScales.push(scaleBefore)
    }
  }
  city.patch([], [KEY])
  tick()
  tick()
  city.patch([{ ...observed(KEY, 'p_a', city.clock), activity: 'thinking' }])
  for (let i = 0; i < 12; i++) tick()

  expect(drawnWhileVisible).toBeLessThan(0.05)
  expect(jumpScales).toHaveLength(1)
  expect(jumpScales[0]).toBeLessThanOrEqual(0.05)
})
