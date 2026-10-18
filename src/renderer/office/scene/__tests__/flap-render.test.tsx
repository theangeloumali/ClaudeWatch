import { render } from '@testing-library/react'
import { createElement } from 'react'
import { Euler, Vector3 } from 'three'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { officePoses, poseOf, structuralKey } from '../../../office-live/pose-store'
import { SIM_TICK_MS, type AgentView } from '../../../../shared/office/types'
import { themeForTeam } from '../../themes/registry'
import { LEAVER_SHRINK_MS, Robot } from '../Robot'
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

// How the views reach the robot: every tick, held back as a slow commit can, or one stalled step.
interface Delivery {
  frameGapMs: number
  flapAfterTicks: number
  firstStepMs?: number
}
const FRAME_S = 1 / 60
// The shrink is the faster ease, so no frame may change size by more than one of its steps.
// The largest scale change one frame may make: a leaver's shrink, the faster of the two.
const SHRINK_STEP = (FRAME_S * 1000) / LEAVER_SHRINK_MS

function playFlap({ frameGapMs, flapAfterTicks, firstStepMs }: Delivery) {
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
  let sinceFrameMs = 0
  let drawnWhileVisible = 0
  let largestScaleStep = 0
  // The drawn size at each teleport: it should already have shrunk away, not pop out.
  const jumpScales: number[] = []
  const draw = (views: AgentView[], stepMs: number) => {
    // As live-feed does: poses every step, the agent prop only when its structure changes.
    const view = views.find((v) => v.agentKey === KEY)!
    officePoses.write(KEY, poseOf(view))
    sinceFrameMs += stepMs
    const key = structuralKey([view])
    if (key !== lastKey && sinceFrameMs >= frameGapMs) {
      show(view)
      lastKey = key
      sinceFrameMs = 0
    }
    for (let i = 0; i < 6; i++) {
      const before = root.position.clone()
      const scaleBefore = presence.scale.x
      frames.callbacks.at(-1)?.({ clock: { elapsedTime: 0 } }, FRAME_S)
      const step = before.distanceTo(root.position)
      largestScaleStep = Math.max(largestScaleStep, Math.abs(presence.scale.x - scaleBefore))
      // A glide: drawn at both ends of a small step. A one-frame jump is a teleport, counted apart.
      if (scaleBefore > 0 && presence.scale.x > 0 && step < 1) drawnWhileVisible += step
      if (step >= 1) jumpScales.push(scaleBefore)
    }
  }
  const tick = () => draw(city.step(), SIM_TICK_MS)
  city.patch([], [KEY])
  for (let i = 0; i < flapAfterTicks; i++) tick()
  city.patch([{ ...observed(KEY, 'p_a', city.clock), activity: 'thinking' }])
  if (firstStepMs) {
    city.clock += firstStepMs
    draw(city.world.step(firstStepMs), firstStepMs)
  }
  for (let i = 0; i < 16; i++) tick()
  return { drawnWhileVisible, jumpScales, largestScaleStep }
}

it.each<[string, Delivery]>([
  ['each tick', { frameGapMs: 0, flapAfterTicks: 2 }],
  // Back before its fade ever showed: the fade's frame is held, its seat's is not.
  ['with its fade held back a tick', { frameGapMs: 200, flapAfterTicks: 0 }],
  ['in one stalled step', { frameGapMs: 0, flapAfterTicks: 0, firstStepMs: 1000 }]
])('never draws a flapped gamer moving or popping while it can be seen (%s)', (_, delivery) => {
  const { drawnWhileVisible, jumpScales, largestScaleStep } = playFlap(delivery)

  expect(drawnWhileVisible).toBeLessThan(0.05)
  expect(jumpScales).toHaveLength(1)
  expect(jumpScales[0]).toBeLessThanOrEqual(1e-9)
  expect(largestScaleStep).toBeLessThanOrEqual(SHRINK_STEP + 1e-9)
})

// A leaver has no reseat to wait for: its robot unmounts with the frame that drops it. live-feed
// sends a fade's first view at once, so the shrink always has the whole fade.
// Its first faded view may land a frame or so late while the removal is on time (Maya n2).
it.each([0, 10, 20, 33, 50])(
  'a leaver has shrunk away by the frame that removes it, its fade seen %i ms late',
  (lateMs) => {
    const city = new CityWorld((now) => [observed(KEY, 'p_a', now)])
    let gaming: AgentView | undefined
    city.run(
      LOUNGE_DELAY_MS + 30_000,
      (views) => void (gaming = views.find((v) => v.agentKey === KEY))
    )
    officePoses.write(KEY, poseOf(gaming!))
    const { presence, show } = mount(gaming!)
    const steps: { atMs: number; view: AgentView | undefined }[] = []
    city.patch([], [KEY])
    for (let tick = 1; tick <= 10; tick++) {
      const view = city.step().find((v) => v.agentKey === KEY)
      steps.push({ atMs: tick * SIM_TICK_MS + (tick === 1 ? lateMs : 0), view })
      if (!view) break
    }
    let scaleWhenRemoved: number | undefined
    let next = 0
    for (let atMs = SIM_TICK_MS; atMs < 2000 && scaleWhenRemoved === undefined; ) {
      while (next < steps.length && steps[next].atMs <= atMs + 1e-9) {
        const { view } = steps[next++]
        if (!view) {
          scaleWhenRemoved = presence.scale.x
          break
        }
        officePoses.write(KEY, poseOf(view))
        show(view)
      }
      if (scaleWhenRemoved !== undefined) break
      frames.callbacks.at(-1)?.({ clock: { elapsedTime: 0 } }, FRAME_S)
      atMs += FRAME_S * 1000
    }

    expect(scaleWhenRemoved).toBeLessThanOrEqual(1e-9)
  }
)
