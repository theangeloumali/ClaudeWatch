import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OfficeApp } from '../../OfficeApp'
import type { OfficeFeed, OfficeFrame } from '../../scene-model'
import type OfficeScene from '../../scene/OfficeScene'
import { LEAD_KEY, makeMinimapFrame, NORTH_FLOOR_ID, ROOM_ID } from './minimap-fixtures'

type SceneProps = ComponentProps<typeof OfficeScene>

// dry-new: the existing app harnesses do not expose minimap navigation plus feed ticks.
const { observeScene, webgl } = vi.hoisted(() => ({
  observeScene: vi.fn<(props: SceneProps) => void>(),
  webgl: { isSupported: true }
}))

vi.mock('../../webgl-support', () => ({ canCreateWebGL2: () => webgl.isSupported }))
vi.mock('../../scene/OfficeScene', () => ({
  default: (props: SceneProps) => {
    observeScene(props)
    return <output aria-label="Minimap test scene">Scene mounted</output>
  }
}))

function controllableFeed() {
  let receiveFrame: (frame: OfficeFrame) => void = () => undefined
  const feed: OfficeFeed = {
    isViewOnly: true,
    subscribe: (listener) => {
      receiveFrame = listener
      return () => undefined
    },
    focus: vi.fn(),
    send: vi.fn(),
    respond: vi.fn(),
    peek: vi.fn(),
    start: vi.fn()
  }
  return { feed, push: (frame: OfficeFrame) => act(() => receiveFrame(frame)) }
}

function latestScene(): SceneProps {
  const latest = observeScene.mock.calls.at(-1)?.[0]
  if (!latest) throw new Error('The OfficeApp test scene has not mounted')
  return latest
}

function expectNoProviderActions(feed: OfficeFeed): void {
  expect(feed.focus).not.toHaveBeenCalled()
  expect(feed.send).not.toHaveBeenCalled()
  expect(feed.respond).not.toHaveBeenCalled()
  expect(feed.peek).not.toHaveBeenCalled()
  expect(feed.start).not.toHaveBeenCalled()
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('innerWidth', 1440)
  vi.stubGlobal('innerHeight', 900)
  vi.clearAllMocks()
  webgl.isSupported = true
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('OfficeApp minimap integration', () => {
  it('mounts the real minimap region and routes room and worker choices without provider actions', async () => {
    const { feed, push } = controllableFeed()
    render(<OfficeApp feed={feed} />)
    push(makeMinimapFrame())
    await screen.findByLabelText('Minimap test scene')
    const minimap = screen.getByRole('region', { name: 'Minimap' })
    fireEvent.click(within(minimap).getByRole('button', { name: /North studio · Floor 1/i }))
    expect(latestScene().focusedFloorId).toBe(NORTH_FLOOR_ID)
    expect(latestScene().viewMode).toBe('office')
    fireEvent.click(within(minimap).getByRole('button', { name: /Research bay/i }))
    expect(latestScene().focusedRoomId).toBe(ROOM_ID)
    fireEvent.click(within(minimap).getByRole('button', { name: /Maya/i }))
    expect(latestScene().selectedAgentKey).toBe(LEAD_KEY)
    expect(screen.getByRole('complementary', { name: 'Agent details' })).toBeInTheDocument()
    expectNoProviderActions(feed)
  })

  it('does not leave the List fallback when a minimap destination or worker is chosen', () => {
    webgl.isSupported = false
    const { feed, push } = controllableFeed()
    render(<OfficeApp feed={feed} />)
    push(makeMinimapFrame())
    expect(
      screen.getByRole('table', { name: /agents by company and project/i })
    ).toBeInTheDocument()
    const minimap = screen.getByRole('region', { name: 'Minimap' })
    fireEvent.click(within(minimap).getByRole('button', { name: /North studio · Floor 1/i }))
    fireEvent.click(within(minimap).getByRole('button', { name: /Research bay/i }))
    fireEvent.click(within(minimap).getByRole('button', { name: /Maya/i }))
    expect(
      screen.getByRole('table', { name: /agents by company and project/i })
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Minimap test scene')).not.toBeInTheDocument()
    expectNoProviderActions(feed)
  })

  it('keeps manual camera ownership and its request unchanged when supplied worker positions tick', async () => {
    const frame = makeMinimapFrame()
    const { feed, push } = controllableFeed()
    render(<OfficeApp feed={feed} />)
    push(frame)
    await screen.findByLabelText('Minimap test scene')
    act(() => latestScene().onManualCameraMove?.())
    expect(latestScene().isCameraManuallyOwned).toBe(true)
    const cameraRequest = latestScene().cameraRequest
    const minimap = screen.getByRole('region', { name: 'Minimap' })
    push({
      ...frame,
      agents: frame.agents.map((agent) =>
        agent.agentKey === LEAD_KEY ? { ...agent, x: 109 } : agent
      )
    })
    expect(latestScene().isCameraManuallyOwned).toBe(true)
    expect(latestScene().cameraRequest).toBe(cameraRequest)
    expect(minimap.querySelector(`circle[data-agent-key="${LEAD_KEY}"]`)).toHaveAttribute(
      'cx',
      '109'
    )
    expectNoProviderActions(feed)
  })
})
