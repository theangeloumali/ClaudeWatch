import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BottomBar } from '../hud/BottomBar'
import { hudSafeInsets, type InspectorLayout } from '../logic/hud-layout'
import { OfficeApp } from '../OfficeApp'
import type { OfficeFeed, OfficeFrame } from '../scene-model'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession } from './fixtures'

vi.mock('../webgl-support', () => ({ canCreateWebGL2: () => true }))
vi.mock('../scene/OfficeScene', () => ({ default: () => <p>Scene drawn</p> }))

function frameWithOneAgent(): OfficeFrame {
  return makeFrame({
    floors: [makeFloor({ floorId: 'f1', rooms: [makeRoom({ id: 'r1', sessionKey: 'claude:a' })] })],
    sessions: [makeSession({ key: 'claude:a', name: 'office renderer' })],
    agents: [makeAgent({ agentKey: 'claude:a', label: 'office renderer', roomId: 'r1' })]
  })
}

function renderOffice(width: number) {
  vi.stubGlobal('innerWidth', width)
  vi.stubGlobal('innerHeight', 900)
  const feed: OfficeFeed = {
    isViewOnly: true,
    subscribe: (listener) => {
      listener(frameWithOneAgent())
      return () => undefined
    },
    focus: vi.fn(),
    send: vi.fn(),
    respond: vi.fn(),
    peek: vi.fn(),
    start: vi.fn()
  }
  return render(<OfficeApp feed={feed} />)
}

function resize(width: number): void {
  vi.stubGlobal('innerWidth', width)
  act(() => void window.dispatchEvent(new Event('resize')))
}

const sidePanels = () => [
  screen.queryByRole('region', { name: 'Minimap' }),
  screen.queryByRole('navigation', { name: 'Offices' }),
  screen.queryByRole('region', { name: /^Office (context|network)$/ })
]
const bottomPanel = () => screen.queryByRole('region', { name: 'Current-session evidence' })

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('hide the panels', () => {
  it.each([
    ['wide', 1440],
    ['medium', 900]
  ])(
    'the toggle hides the side and bottom panels on wide and medium layouts (%s)',
    async (_layout, width) => {
      renderOffice(width)
      await screen.findByText('Scene drawn')
      expect(sidePanels()[0]).not.toBeNull()
      expect(bottomPanel()).not.toBeNull()

      const toggle = screen.getByRole('button', { name: 'Hide panels' })
      fireEvent.click(toggle)
      expect(toggle).toHaveAttribute('aria-pressed', 'true')
      expect(sidePanels()).toEqual([null, null, null])
      expect(bottomPanel()).toBeNull()
      // The header, the bar that brings them back and the screen-reader status stay.
      expect(screen.getByRole('heading', { name: 'Office', level: 1 })).toBeInTheDocument()
      expect(screen.getByRole('status')).toBeInTheDocument()

      fireEvent.click(toggle)
      expect(toggle).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByRole('region', { name: 'Minimap' })).toBeInTheDocument()
      expect(bottomPanel()).not.toBeNull()
    }
  )

  it('phones keep the bottom sheet', async () => {
    renderOffice(1440)
    await screen.findByText('Scene drawn')
    fireEvent.click(screen.getByRole('button', { name: 'Hide panels' }))
    expect(screen.queryByRole('region', { name: 'Minimap' })).toBeNull()

    resize(390)
    expect(screen.queryByRole('button', { name: 'Hide panels' })).toBeNull()
    expect(screen.getByText('Office context', { selector: 'summary' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Minimap' })).toBeInTheDocument()
  })
})

describe('hudSafeInsets', () => {
  const layout = (viewportWidth: number, arePanelsHidden: boolean): InspectorLayout => ({
    width: 320,
    viewportWidth,
    viewportHeight: 900,
    topInset: 0,
    isExpanded: false,
    hudTopHeight: 64,
    hudBottomHeight: 48,
    navigationHeight: 300,
    isContextVisible: true,
    arePanelsHidden
  })

  it('safe insets drop to 0 while hidden', () => {
    expect(hudSafeInsets(true, layout(1440, true))).toEqual({
      left: 0,
      right: 0,
      top: 64,
      bottom: 48
    })
    // Medium stacks the rails above the scene; hidden, only the header and bar remain.
    expect(hudSafeInsets(true, layout(900, true))).toEqual({
      left: 0,
      right: 0,
      top: 64,
      bottom: 48
    })
    expect(hudSafeInsets(true, layout(1440, false)).left).toBeGreaterThan(0)
  })

  it('a phone keeps its sheet insets whatever the flag says', () => {
    expect(hudSafeInsets(true, layout(390, true))).toEqual(hudSafeInsets(true, layout(390, false)))
  })
})

describe('the hide-panels control', () => {
  it('the control is a 44 px target with a label', () => {
    const onTogglePanels = vi.fn()
    render(
      <BottomBar
        floorThemeLabel="Neo Edo Steam"
        renderThemes={() => null}
        wallsMode="cutaway"
        isListView={false}
        is3DAvailable
        isMetricsVisible={false}
        onWallsMode={vi.fn()}
        onToggleList={vi.fn()}
        onToggleMetrics={vi.fn()}
        onRotate={vi.fn()}
        onZoom={vi.fn()}
        onFit={vi.fn()}
        isWalking={false}
        onToggleWalk={vi.fn()}
        hasPlayer
        isSettingsOpen={false}
        onToggleSettings={vi.fn()}
        arePanelsHidden={false}
        onTogglePanels={onTogglePanels}
      />
    )
    const toggle = screen.getByRole('button', { name: 'Hide panels' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle.className).toMatch(/\bmin-h-11\b/)
    expect(toggle.className).toMatch(/\bmin-w-11\b/)
    // Outside the plate face, so the chamfer cannot clip it.
    expect(toggle.closest('.plate-face')).toBeNull()
    fireEvent.click(toggle)
    expect(onTogglePanels).toHaveBeenCalledOnce()
  })
})
