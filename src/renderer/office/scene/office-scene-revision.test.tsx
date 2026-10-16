import { render } from '@testing-library/react'
import { Children, isValidElement, type ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import type { AgentView } from '../../../shared/office/types'
import { makeAgent, makeFloor, makeRoom } from '../__tests__/fixtures'
import type { FloorGeometry } from '../scene-model'
import { themeForTeam } from '../themes/registry'
import OfficeScene from './OfficeScene'

// The canvas is not drawn; it only reports the revision handed to the batched scene.
const revisions: string[] = []
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children?: ReactNode }) => {
    for (const child of Children.toArray(children)) {
      if (isValidElement<{ revision?: unknown }>(child) && typeof child.props.revision === 'string')
        revisions.push(child.props.revision)
    }
    return null
  },
  useFrame: () => undefined,
  useThree: () => undefined
}))

afterEach(() => {
  revisions.length = 0
  vi.restoreAllMocks()
})

const floor = makeFloor({ floorId: 'f1', label: 'Main', rooms: [makeRoom({ id: 'r1' })] })
const theme = themeForTeam()

function scene(agents: readonly AgentView[], visibleFloors?: readonly FloorGeometry[]) {
  return (
    <OfficeScene
      visibleFloors={visibleFloors}
      theme={theme}
      floors={[{ floorId: 'f1', label: 'Main', attentionCount: 0 }]}
      sessions={[]}
      floor={floor}
      agents={agents}
      cards={[]}
      stacks={[]}
      selectedAgentKey={null}
      wallsMode="cutaway"
      cameraRequest={null}
      metrics={{ fps: 0, frameMs: 0, drawCalls: 0, triangles: 0 }}
      onSelectAgent={() => undefined}
      onFlyToAgent={() => undefined}
      onFlyToZone={() => undefined}
      reviewableKeys={new Set()}
      onReview={() => undefined}
      speakingAgentKey={null}
    />
  )
}

const walker = (x: number, overrides: Partial<AgentView> = {}): AgentView =>
  makeAgent({ agentKey: 'claude:a', x, z: x / 2, heading: x, activity: 'running', ...overrides })

const floorSerialisations = (stringify: { mock: { calls: unknown[][] } }): number =>
  stringify.mock.calls.filter(([value]) => Array.isArray(value) && value.includes(floor)).length

it('keeps the revision and skips re-serialising the floor while agents only move', () => {
  const view = render(scene([walker(0)]))
  const stringify = vi.spyOn(JSON, 'stringify')
  for (const step of [1, 2, 3]) view.rerender(scene([walker(step)]))
  expect(revisions.length).toBe(4)
  expect(new Set(revisions).size).toBe(1)
  expect(floorSerialisations(stringify)).toBe(0)
})

it('changes the revision when an agent joins, leaves or changes provider or role', () => {
  const view = render(scene([walker(0)]))
  view.rerender(scene([walker(0), makeAgent({ agentKey: 'claude:b' })]))
  view.rerender(scene([walker(0)]))
  view.rerender(scene([walker(0, { provider: 'codex' })]))
  view.rerender(scene([walker(0, { provider: 'codex', isSubagent: true })]))
  const [alone, joined, left, switched, subagent] = revisions
  expect(joined).not.toBe(alone)
  expect(left).toBe(alone)
  expect(switched).not.toBe(alone)
  expect(subagent).not.toBe(switched)
})

// perf-11: storeys batch their robots apart, so the floor batch stands through roster churn.
it('with storeys drawn, keeps the floor revision when an agent joins, leaves or roams', () => {
  const storeys = [floor]
  const view = render(scene([walker(0)], storeys))
  view.rerender(scene([walker(0), makeAgent({ agentKey: 'claude:b' })], storeys))
  view.rerender(scene([walker(0, { roomId: 'r2', physicalFloorId: null })], storeys))
  view.rerender(scene([walker(0)], storeys))
  expect(revisions).toHaveLength(4)
  expect(new Set(revisions).size).toBe(1)
})
