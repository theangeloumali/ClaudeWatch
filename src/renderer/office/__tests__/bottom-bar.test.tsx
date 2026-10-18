import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BottomBar } from '../hud/BottomBar'

function setup(overrides: Partial<Parameters<typeof BottomBar>[0]> = {}) {
  const onRotate = vi.fn()
  const onZoom = vi.fn()
  const onFit = vi.fn()
  render(
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
      onRotate={onRotate}
      onZoom={onZoom}
      onFit={onFit}
      isWalking={false}
      onToggleWalk={vi.fn()}
      hasPlayer
      isSettingsOpen={false}
      onToggleSettings={vi.fn()}
      {...overrides}
    />
  )
  return { onRotate, onZoom, onFit }
}

describe('BottomBar camera controls', () => {
  it('keeps compact scene controls outside the chamfer clip and preserves edit activation', () => {
    const onEditLayout = vi.fn()
    setup({ isCompact: true, onEditLayout })
    fireEvent.click(screen.getByText('More controls', { selector: 'summary' }))
    const edit = screen.getByRole('button', { name: /^Edit layout$/ })
    expect(edit.closest('.plate, .plate-face')).toBeNull()
    fireEvent.click(edit)
    expect(onEditLayout).toHaveBeenCalledOnce()
  })

  it('offers Rotate left and Rotate right buttons with their shortcuts', () => {
    const { onRotate } = setup()
    const left = screen.getByRole('button', { name: 'Rotate left' })
    const right = screen.getByRole('button', { name: 'Rotate right' })
    expect(left).toHaveAttribute('aria-keyshortcuts', 'Q')
    expect(right).toHaveAttribute('aria-keyshortcuts', 'E')
    fireEvent.click(left)
    expect(onRotate).toHaveBeenLastCalledWith(-1)
    fireEvent.click(right)
    expect(onRotate).toHaveBeenLastCalledWith(1)
  })

  it('offers Zoom out, Zoom in and Fit with the keys that do the same', () => {
    const { onZoom, onFit } = setup()
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' })
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' })
    const fit = screen.getByRole('button', { name: 'Fit, shortcut 0' })
    expect(zoomOut).toHaveAttribute('aria-keyshortcuts', '-')
    expect(zoomIn).toHaveAttribute('aria-keyshortcuts', '=')
    expect(fit).toHaveAttribute('aria-keyshortcuts', '0')
    expect(fit).toHaveTextContent('0')
    fireEvent.click(zoomOut)
    expect(onZoom).toHaveBeenLastCalledWith('out')
    fireEvent.click(zoomIn)
    expect(onZoom).toHaveBeenLastCalledWith('in')
    fireEvent.click(fit)
    expect(onFit).toHaveBeenCalledOnce()
  })

  it('disables the camera controls while the list view replaces the scene', () => {
    setup({ isListView: true })
    for (const name of ['Rotate left', 'Zoom in', 'Fit, shortcut 0'])
      expect(screen.getByRole('button', { name })).toBeDisabled()
  })

  it('names the floor theme and opens the themes list', () => {
    setup()
    const themes = screen.getByRole('button', { name: /^Map theme: Neo Edo Steam/ })
    expect(themes).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Themes list')).toBeNull()
    fireEvent.click(themes)
    expect(themes).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Themes list')).toBeInTheDocument()
  })
})

describe('BottomBar walking', () => {
  it('offers a Walk switch with its own key, off until pressed', () => {
    const onToggleWalk = vi.fn()
    setup({ onToggleWalk })
    const walk = screen.getByRole('button', { name: /Control player/ })
    expect(walk).toHaveAttribute('aria-pressed', 'false')
    expect(walk).toHaveTextContent('G')
    fireEvent.click(walk)
    expect(onToggleWalk).toHaveBeenCalledOnce()
    expect(screen.queryByText(/to walk/)).not.toBeInTheDocument()
  })

  it('shows one line naming the keys while walking is on', () => {
    setup({ isWalking: true })
    expect(screen.getByRole('button', { name: /Stop controlling/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    const hint = screen.getByText(/to walk/)
    expect(hint).toHaveTextContent('W A S D')
    expect(hint).toHaveTextContent('X')
  })

  it('cannot be switched on while the office is shown as a list', () => {
    setup({ isListView: true })
    expect(screen.getByRole('button', { name: /Control player/ })).toBeDisabled()
  })
})
