import { render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { makeAgent } from '../__tests__/fixtures'
import { themeForTeam } from '../themes/registry'
import type { RobotModelProps } from '../themes/types'
import type { AgentView } from '../../../shared/office/types'
import { RobotCrew } from './Robot'

// react-dom stands in for the canvas, so the effect that places three.js objects is skipped.
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useLayoutEffect: () => undefined
}))
vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined }))
vi.mock('./textures', () => ({ blobShadowTexture: () => null }))

// The three.js tags are unknown to react-dom; its warnings about them are not under test.
beforeEach(() => void vi.spyOn(console, 'error').mockImplementation(() => undefined))
afterEach(() => vi.restoreAllMocks())

it('re-renders only the robots whose agent changed on a step', () => {
  const rendered: string[] = []
  const Model = ({ agent }: RobotModelProps) => {
    rendered.push(agent.agentKey)
    return null
  }
  const floorTheme = { ...themeForTeam(), robot: { ...themeForTeam().robot, Model } }
  const onSelect = vi.fn()
  const onFly = vi.fn()
  const crew = (agents: readonly AgentView[]) =>
    createElement(RobotCrew, {
      agents,
      zoneGroups: [],
      floorTheme,
      selectedAgentKey: null,
      speakingAgentKey: null,
      isReducedMotion: true,
      onSelect,
      onFly
    })
  const idle = makeAgent({ agentKey: 'idle', x: 1 })
  const walker = makeAgent({ agentKey: 'walker', x: 2 })
  const { rerender } = render(crew([idle, walker]))
  rendered.length = 0

  // A step hands over fresh objects; only the walker's values differ.
  rerender(crew([{ ...idle }, { ...walker, x: 2.5 }]))

  expect(rendered).toEqual(['walker'])

  rendered.length = 0
  rerender(crew([{ ...idle }, { ...walker, x: 2.5 }]))
  expect(rendered).toEqual([])
})
