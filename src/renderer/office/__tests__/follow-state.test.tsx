import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentView } from '../../../shared/office/types'
import { INITIAL_OFFICE_STATE, officeReducer, type OfficeState } from '../logic/office-reducer'
import { OfficeApp } from '../OfficeApp'
import type { OfficeFeed, OfficeFrame } from '../scene-model'
import type OfficeScene from '../scene/OfficeScene'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession } from './fixtures'

type SceneProps = ComponentProps<typeof OfficeScene>

const { observeScene } = vi.hoisted(() => ({ observeScene: vi.fn<(props: SceneProps) => void>() }))
vi.mock('../webgl-support', () => ({ canCreateWebGL2: () => true }))
vi.mock('../scene/OfficeScene', () => ({
  default: (props: SceneProps) => {
    observeScene(props)
    return (
      <button type="button" onClick={() => props.onSelectAgent('claude:a')}>
        Pick the walker
      </button>
    )
  }
}))

function frameWith(agent: Partial<AgentView> = {}): OfficeFrame {
  return makeFrame({
    floors: [makeFloor({ floorId: 'f1', rooms: [makeRoom({ id: 'r1', sessionKey: 'claude:a' })] })],
    sessions: [makeSession({ key: 'claude:a', name: 'walker' })],
    agents: [makeAgent({ agentKey: 'claude:a', roomId: 'r1', floorId: 'f1', ...agent })]
  })
}

function following(): OfficeState {
  const ready = officeReducer(INITIAL_OFFICE_STATE, { type: 'frame-received', frame: frameWith() })
  return officeReducer(ready, { type: 'agent-followed', agentKey: 'claude:a' })
}

beforeEach(() => {
  localStorage.clear()
  observeScene.mockClear()
  vi.stubGlobal('innerWidth', 1440)
  vi.stubGlobal('innerHeight', 900)
})
afterEach(() => vi.unstubAllGlobals())

describe('the Follow state', () => {
  it('Follow selects the agent and asks the camera to ride along', () => {
    const state = following()
    expect(state).toMatchObject({
      followedAgentKey: 'claude:a',
      selectedAgentKey: 'claude:a',
      isWalking: false,
      cameraRequest: { kind: 'follow', agentKey: 'claude:a' }
    })
  })

  it('manual input ends it', () => {
    expect(officeReducer(following(), { type: 'camera-manually-moved' }).followedAgentKey).toBe(
      null
    )
    expect(
      officeReducer(following(), { type: 'camera-zoomed', direction: 'in' }).followedAgentKey
    ).toBe(null)
    expect(
      officeReducer(following(), { type: 'camera-pointed', x: 1, z: 2 }).followedAgentKey
    ).toBe(null)
  })

  it('a departed agent ends it', () => {
    const leaving = officeReducer(following(), {
      type: 'frame-received',
      frame: frameWith({ place: 'leaving', fade: 0.2 })
    })
    expect(leaving.followedAgentKey).toBe(null)
    const gone = officeReducer(following(), {
      type: 'frame-received',
      frame: makeFrame({ floors: frameWith().floors })
    })
    expect(gone.followedAgentKey).toBe(null)
  })

  it('walking and Follow exclude each other', () => {
    expect(officeReducer(following(), { type: 'walk-toggled' }).followedAgentKey).toBe(null)
  })
})

describe('the Follow control', () => {
  it('is a 44 px labelled toggle next to the agent it follows', async () => {
    const feed: OfficeFeed = {
      isViewOnly: true,
      subscribe: (listener) => {
        listener(frameWith())
        return () => undefined
      },
      focus: vi.fn(),
      send: vi.fn(),
      respond: vi.fn(),
      peek: vi.fn(),
      start: vi.fn()
    }
    render(<OfficeApp feed={feed} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Pick the walker' }))
    const follow = screen.getByRole('button', { name: 'Follow' })
    expect(follow).toHaveAttribute('aria-pressed', 'false')
    expect(follow.className).toMatch(/\bmin-h-11\b/)
    expect(follow.className).toMatch(/\bmin-w-11\b/)
    fireEvent.click(follow)
    expect(follow).toHaveAttribute('aria-pressed', 'true')
    expect(observeScene.mock.calls.at(-1)?.[0]).toMatchObject({
      followedAgentKey: 'claude:a',
      cameraRequest: { kind: 'follow', agentKey: 'claude:a' }
    })
    fireEvent.click(follow)
    expect(follow).toHaveAttribute('aria-pressed', 'false')
  })
})
