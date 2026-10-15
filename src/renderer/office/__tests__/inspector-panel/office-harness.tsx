import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import type { InteractionResult, PeekResult } from '../../../../shared/office/types'
import { OfficeApp } from '../../OfficeApp'
import type { OfficeFeed, OfficeFrame } from '../../scene-model'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession } from '../fixtures'

// dry-new: Existing HUD harnesses are file-local; share only the feed boundary, not UI behavior.
export function createOfficeHarness(frame: OfficeFrame = makeInspectorFrame()) {
  let publishFrame: ((snapshot: OfficeFrame) => void) | undefined
  const refusedInteraction = async (): Promise<InteractionResult> => ({
    success: false,
    reason: 'not-permitted'
  })
  const feed: OfficeFeed = {
    subscribe(listener) {
      publishFrame = listener
      return () => {
        publishFrame = undefined
      }
    },
    focus: vi.fn(async () => ({ success: false })),
    send: vi.fn(refusedInteraction),
    respond: vi.fn(refusedInteraction),
    start: vi.fn(refusedInteraction),
    peek: vi.fn(
      async (): Promise<PeekResult> => ({
        success: true,
        lines: Array.from({ length: 60 }, (_, index) => `Fixture terminal line ${index}`)
      })
    )
  }
  const view = render(<OfficeApp feed={feed} />)
  const push = (snapshot: OfficeFrame): void => {
    if (!publishFrame) throw new Error('OfficeApp has not subscribed to the test feed')
    const publish = publishFrame
    act(() => publish(snapshot))
  }
  push(frame)
  return { feed, push, ...view }
}

function makeInspectorFrame(): OfficeFrame {
  return makeFrame({
    floors: [
      makeFloor({
        floorId: 'f1',
        rooms: [makeRoom({ id: 'r1', sessionKey: 'claude:renderer' })]
      })
    ],
    sessions: [makeSession({ key: 'claude:renderer', name: 'office renderer', host: 'orca' })],
    agents: [makeAgent({ agentKey: 'claude:renderer', label: 'office renderer' })]
  })
}

export function selectInspector(): HTMLElement {
  const table = screen.getByRole('table', { name: /agents by company and project/i })
  fireEvent.click(within(table).getByRole('button', { name: /^office renderer/ }))
  return screen.getByRole('complementary', { name: 'Agent details' })
}

export function setViewportWidth(width: number): void {
  vi.stubGlobal('innerWidth', width)
  fireEvent(window, new Event('resize'))
}

export function installInspectorTestEnvironment(): void {
  beforeEach(() => {
    setViewportWidth(1280)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
}
