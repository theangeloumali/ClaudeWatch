import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { BottomBar } from '../../hud/BottomBar'
import { officeSettings } from '../../logic/office-settings'

it('retains a visible enable path when the saved player setting is off', () => {
  officeSettings.set('player', false)
  const onToggleWalk = vi.fn()
  render(
    <BottomBar
      floorThemeLabel="Corporate City"
      renderThemes={() => null}
      wallsMode="cutaway"
      isListView={false}
      is3DAvailable
      isMetricsVisible={false}
      isWalking={false}
      hasPlayer={false}
      onToggleWalk={onToggleWalk}
      isSettingsOpen={false}
      onToggleSettings={vi.fn()}
      onWallsMode={vi.fn()}
      onToggleList={vi.fn()}
      onToggleMetrics={vi.fn()}
      onRotate={vi.fn()}
      onZoom={vi.fn()}
      onFit={vi.fn()}
    />
  )
  const enable = screen.getByRole('button', { name: 'Enable player' })
  fireEvent.click(enable)
  expect(officeSettings.get().player).toBe(true)
  expect(onToggleWalk).toHaveBeenCalledOnce()
  officeSettings.reset()
})
