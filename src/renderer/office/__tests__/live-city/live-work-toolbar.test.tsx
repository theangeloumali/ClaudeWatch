import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BottomBar } from '../../hud/BottomBar'

afterEach(cleanup)

it('keeps primary view controls visible and discloses functional camera tools', () => {
  const onReset = vi.fn()
  const onEditLayout = vi.fn()
  const onRotate = vi.fn()
  render(
    <BottomBar
      floorThemeLabel="Corporate City"
      renderThemes={() => null}
      wallsMode="cutaway"
      isListView={false}
      is3DAvailable
      isMetricsVisible={false}
      isWalking={false}
      hasPlayer
      isSettingsOpen={false}
      onToggleSettings={vi.fn()}
      onToggleWalk={vi.fn()}
      onWallsMode={vi.fn()}
      onToggleList={vi.fn()}
      onToggleMetrics={vi.fn()}
      onRotate={onRotate}
      onZoom={vi.fn()}
      onFit={vi.fn()}
      onView={vi.fn()}
      viewMode="city"
      onReset={onReset}
      onEditLayout={onEditLayout}
    />
  )
  expect(screen.getByRole('button', { name: 'City' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
  fireEvent.click(screen.getByRole('button', { name: 'Edit layout' }))
  expect(onReset).toHaveBeenCalledOnce()
  expect(onEditLayout).toHaveBeenCalledOnce()
  expect(screen.getByText('More controls').closest('details')).not.toHaveAttribute('open')
  fireEvent.click(screen.getByText('More controls'))
  fireEvent.click(screen.getByRole('button', { name: 'Rotate left' }))
  expect(onRotate).toHaveBeenCalledWith(-1)
})
