import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BottomBar } from '../../hud/BottomBar'
import { INITIAL_OFFICE_STATE, officeReducer } from '../../logic/office-reducer'
import { makeFloor, makeFrame, makeZone } from '../fixtures'

describe('Office and City framing presets', () => {
  it('changes framing without replacing the frame, selection or permission review', () => {
    const frame = makeFrame({
      floors: [
        makeFloor({ floorId: 'office', zones: [makeZone({ id: 'project:real', kind: 'project' })] })
      ]
    })
    const initial = {
      ...INITIAL_OFFICE_STATE,
      frame,
      focusedFloorId: 'office',
      selectedAgentKey: 'claude:real',
      focusedZoneId: 'project:real',
      reviewingSessionKey: 'claude:real',
      isWalking: true
    }
    const city = officeReducer(initial, { type: 'view-set', view: 'city' })
    expect(city.frame).toBe(frame)
    expect(city.selectedAgentKey).toBe(initial.selectedAgentKey)
    expect(city.reviewingSessionKey).toBe(initial.reviewingSessionKey)
    expect(city.viewMode).toBe('city')
    expect(city.isWalking).toBe(false)
    expect(city.cameraRequest?.kind).toBe('city')
    const office = officeReducer(city, { type: 'view-set', view: 'office' })
    expect(office.selectedAgentKey).toBe(initial.selectedAgentKey)
    expect(office.cameraRequest).toMatchObject({ kind: 'office' })
    expect(office.cameraRequest?.nonce).toBeGreaterThan(city.cameraRequest?.nonce ?? 0)
  })

  it('fits the current working floor when a remembered project has disappeared', () => {
    const frame = makeFrame({ floors: [makeFloor({ floorId: 'office' })] })
    const office = officeReducer(
      {
        ...INITIAL_OFFICE_STATE,
        frame,
        focusedFloorId: 'office',
        viewMode: 'city',
        focusedZoneId: 'removed-project',
        cameraRequest: { kind: 'city', nonce: 1 }
      },
      { type: 'view-set', view: 'office' }
    )
    expect(office.cameraRequest).toEqual({ kind: 'office', nonce: 2 })
    expect(office.focusedZoneId).toBeNull()
  })

  it('offers labeled, keyboard-focusable view controls, disabled in List view', () => {
    const onView = vi.fn()
    const onTilt = vi.fn()
    const onWorkstation = vi.fn()
    const props = {
      floorThemeLabel: 'Corporate City',
      renderThemes: () => null,
      wallsMode: 'cutaway' as const,
      isListView: false,
      is3DAvailable: true,
      isMetricsVisible: false,
      isWalking: false,
      onToggleWalk: vi.fn(),
      hasPlayer: true,
      isSettingsOpen: false,
      onToggleSettings: vi.fn(),
      onWallsMode: vi.fn(),
      onToggleList: vi.fn(),
      onToggleMetrics: vi.fn(),
      onRotate: vi.fn(),
      onTilt,
      onWorkstation,
      canWorkstation: false,
      onZoom: vi.fn(),
      onFit: vi.fn(),
      viewMode: 'office' as const,
      onView
    }
    const { rerender } = render(<BottomBar {...props} />)
    expect(screen.getByRole('group', { name: 'View' })).toBeInTheDocument()
    const city = screen.getByRole('button', { name: 'City' })
    expect(screen.getByRole('button', { name: 'Office' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Workstation' })).toBeDisabled()
    const tilt = screen.getByRole('button', { name: 'Tilt up' })
    expect(tilt).toHaveAttribute('aria-keyshortcuts', 'PageUp')
    fireEvent.click(tilt)
    expect(onTilt).toHaveBeenCalledExactlyOnceWith(1)
    city.focus()
    expect(city).toHaveFocus()
    fireEvent.click(city)
    expect(onView).toHaveBeenCalledExactlyOnceWith('city')
    rerender(<BottomBar {...props} canWorkstation />)
    fireEvent.click(screen.getByRole('button', { name: 'Workstation' }))
    expect(onWorkstation).toHaveBeenCalledOnce()
    rerender(<BottomBar {...props} isListView />)
    expect(city).toBeDisabled()
  })
})
