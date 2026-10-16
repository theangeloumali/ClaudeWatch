import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OfficeApp } from '../OfficeApp'
import { CONTEXT_GRACE_MS, SceneErrorBoundary } from '../SceneErrorBoundary'
import type { AgentView } from '../../../shared/office/types'
import type { OfficeFeed } from '../scene-model'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession, makeZone } from './fixtures'

const { invalidate } = vi.hoisted(() => ({ invalidate: vi.fn() }))
vi.mock('@react-three/fiber', () => ({ invalidate }))
vi.mock('../webgl-support', () => ({ canCreateWebGL2: () => true }))
vi.mock('../scene/OfficeScene', () => ({
  default: ({ agents }: { agents: readonly AgentView[] }) => (
    <div>
      <canvas data-testid="office-canvas" />
      <span>{agents.length} agents in 3D</span>
    </div>
  )
}))

const frame = makeFrame({
  floors: [
    makeFloor({
      floorId: 'one',
      label: 'Office',
      rooms: [
        makeRoom({ id: 'r1', sessionKey: 'claude:a' }),
        makeRoom({ id: 'r2', sessionKey: 'claude:b' })
      ],
      zones: [
        makeZone({
          id: 'c-guild',
          kind: 'company',
          label: 'Guild',
          companyKey: 'c_test',
          children: [
            makeZone({ id: 'p-forge', kind: 'project', label: 'Forge', projectKey: 'p_1' })
          ]
        })
      ]
    })
  ],
  sessions: [makeSession({ key: 'claude:a' }), makeSession({ key: 'claude:b' })],
  agents: [
    makeAgent({ agentKey: 'a1', floorId: 'one', roomId: 'r1' }),
    makeAgent({ agentKey: 'b1', floorId: 'one', roomId: 'r2' })
  ]
})
const feed: OfficeFeed = {
  subscribe: (listener) => {
    listener(frame)
    return () => undefined
  },
  focus: vi.fn().mockResolvedValue({ success: true }),
  send: vi.fn(),
  respond: vi.fn(),
  peek: vi.fn(),
  start: vi.fn()
}

// The context events three's canvas fires; they do not bubble.
function fire(canvas: Element, type: 'webglcontextlost' | 'webglcontextrestored'): void {
  act(() => {
    canvas.dispatchEvent(new Event(type))
  })
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('innerWidth', 1440)
  invalidate.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('a lost GL context (P8)', () => {
  it('lost then restored within the grace period stays in 3D', async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    render(
      <SceneErrorBoundary onError={onError}>
        <canvas data-testid="gl" />
      </SceneErrorBoundary>
    )
    const canvas = screen.getByTestId('gl')
    fire(canvas, 'webglcontextlost')
    act(() => vi.advanceTimersByTime(CONTEXT_GRACE_MS - 1))
    fire(canvas, 'webglcontextrestored')
    act(() => vi.advanceTimersByTime(CONTEXT_GRACE_MS * 2))
    expect(onError).not.toHaveBeenCalled()
    expect(screen.getByTestId('gl')).toBeInTheDocument()
    await vi.dynamicImportSettled()
    expect(invalidate).toHaveBeenCalledOnce()
  })

  it('lost with no restore past the grace period shows the List view with the agent count unchanged', async () => {
    render(<OfficeApp feed={feed} />)
    expect(await screen.findByText('2 agents in 3D')).toBeInTheDocument()
    vi.useFakeTimers()
    fire(screen.getByTestId('office-canvas'), 'webglcontextlost')
    act(() => vi.advanceTimersByTime(CONTEXT_GRACE_MS - 1))
    expect(screen.getByTestId('office-canvas')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByTestId('office-canvas')).toBeNull()
    expect(screen.getByRole('table', { name: 'Agents by company and project' })).toBeVisible()
    expect(screen.getAllByRole('button', { name: /^Focus terminal for / })).toHaveLength(2)
  })
})
