import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { PlayerControls } from '../../hud/PlayerControls'
import { createPlayer } from '../../player/walking'

it('holds movement only while a directional button is pressed and releases on cancellation', () => {
  const player = createPlayer({ x: 0, z: 0 })
  player.onGoal = vi.fn()
  const view = render(<PlayerControls player={player} onInspect={vi.fn()} />)
  const up = screen.getByRole('button', { name: 'Move player up' })
  fireEvent.pointerDown(up, { pointerId: 1 })
  expect(player.held.has('ArrowUp')).toBe(true)
  expect(player.onGoal).toHaveBeenCalledOnce()
  fireEvent.pointerCancel(up)
  expect(player.held.size).toBe(0)
  fireEvent.keyDown(up, { key: ' ' })
  expect(player.held.has('ArrowUp')).toBe(true)
  fireEvent.keyUp(up, { key: ' ' })
  expect(player.held.size).toBe(0)
  fireEvent.pointerDown(up, { pointerId: 1 })
  view.unmount()
  expect(player.held.size).toBe(0)
})

it('inspects only the actual nearby worker without sending a session action', () => {
  const onInspect = vi.fn()
  const player = createPlayer({ x: 0, z: 0 })
  const view = render(<PlayerControls player={player} onInspect={onInspect} />)
  const inspect = screen.getByRole('button', { name: 'Inspect nearby agent' })
  expect(inspect).toBeDisabled()
  view.rerender(
    <PlayerControls
      player={player}
      nearAgent={{ agentKey: 'claude:real', label: 'Real worker' }}
      onInspect={onInspect}
    />
  )
  fireEvent.click(inspect)
  expect(onInspect).toHaveBeenCalledExactlyOnceWith('claude:real')
})
