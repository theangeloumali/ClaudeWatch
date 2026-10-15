import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { officeSettings } from '../logic/office-settings'
import { BottomBar } from './BottomBar'

beforeEach(() => {
  localStorage.clear()
  officeSettings.reset()
})

type BarProps = Parameters<typeof BottomBar>[0]

// The open state lives above the bar, where the comma key can reach it too.
function Bar(overrides: Partial<BarProps>) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  return (
    <BottomBar
      floorThemeLabel="Neo Edo Steam"
      renderThemes={() => <p>Themes list</p>}
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
      isSettingsOpen={isSettingsOpen}
      onToggleSettings={() => setIsSettingsOpen((isOpen) => !isOpen)}
      {...overrides}
    />
  )
}

const settingsButton = (): HTMLElement => screen.getByRole('button', { name: /^Settings/ })
const panel = (): HTMLElement | null => screen.queryByRole('dialog', { name: 'Office settings' })

it('offers a Settings button with its key that opens the panel', () => {
  render(<Bar />)
  expect(settingsButton()).toHaveTextContent(',')
  expect(settingsButton()).toHaveAttribute('aria-keyshortcuts', ',')
  expect(settingsButton()).toHaveAttribute('aria-expanded', 'false')
  expect(panel()).toBeNull()

  fireEvent.click(settingsButton())
  expect(settingsButton()).toHaveAttribute('aria-expanded', 'true')
  expect(settingsButton()).toHaveAttribute('aria-controls', panel()?.id)
  expect(screen.getByRole('heading', { name: 'Office settings' })).toHaveFocus()
})

it('gives focus back to the Settings button when Escape closes the panel', () => {
  render(<Bar />)
  fireEvent.click(settingsButton())
  fireEvent.keyDown(screen.getByRole('switch', { name: 'Citizens' }), { key: 'Escape' })
  expect(panel()).toBeNull()
  expect(settingsButton()).toHaveFocus()
})

it('stays usable in the list view, where the scene controls are disabled', () => {
  render(<Bar isListView />)
  expect(settingsButton()).not.toBeDisabled()
})

it('shows one panel at a time: opening the themes closes the settings', () => {
  render(<Bar />)
  fireEvent.click(settingsButton())
  const themes = screen.getByRole('button', { name: /^Map theme/ })
  fireEvent.click(themes)
  expect(panel()).toBeNull()
  expect(screen.getByText('Themes list')).toBeInTheDocument()

  fireEvent.click(settingsButton())
  expect(panel()).not.toBeNull()
  expect(screen.queryByText('Themes list')).toBeNull()
  expect(themes).toHaveAttribute('aria-expanded', 'false')
})

it('offers a visible enable path and no walking hint while the player is switched off', () => {
  render(<Bar hasPlayer={false} isWalking />)
  expect(screen.getByRole('button', { name: 'Enable player' })).toBeInTheDocument()
  expect(screen.queryByText(/to walk/)).toBeNull()
})
