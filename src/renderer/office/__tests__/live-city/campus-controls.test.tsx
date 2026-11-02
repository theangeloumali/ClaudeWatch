import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { BottomBar } from '../../hud/BottomBar'
import { placePlayerAtOrigin } from '../../player/player-floor-routes'
import { createPlayer } from '../../player/walking'

const barProps = {
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
  onZoom: vi.fn(),
  onFit: vi.fn()
}

it('offers City · Campus · Office, and Campus is the city view in the Campus layout', () => {
  const onView = vi.fn()
  const onWorldLayout = vi.fn()
  render(
    <BottomBar
      {...barProps}
      viewMode="city"
      worldLayout="campus"
      onView={onView}
      onWorldLayout={onWorldLayout}
    />
  )
  const group = screen.getByRole('group', { name: 'View' })
  const labels = [...group.querySelectorAll('button')].map((button) => button.textContent)
  expect(labels.slice(0, 3)).toEqual(['City', 'Campus', 'Office'])
  expect(screen.getByRole('button', { name: 'Campus' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'City' })).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(screen.getByRole('button', { name: 'City' }))
  expect(onWorldLayout).toHaveBeenLastCalledWith('city')
  expect(onView).toHaveBeenLastCalledWith('city')
  fireEvent.click(screen.getByRole('button', { name: 'Office' }))
  expect(onView).toHaveBeenLastCalledWith('office')
  expect(onWorldLayout).toHaveBeenCalledOnce()
})

it('restarts the player on the plaza with no route left to walk', () => {
  const player = createPlayer({ x: 40, z: -12 })
  player.path = [{ x: 41, z: -12, elevation: 0, physicalFloorId: 'f' }]
  player.physicalFloorId = 'f'
  placePlayerAtOrigin(player)
  expect(player).toMatchObject({
    position: { x: 0, z: 0 },
    path: [],
    goal: null,
    physicalFloorId: null
  })
})
