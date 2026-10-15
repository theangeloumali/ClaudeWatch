import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EDO } from '../themes/palettes'
import { MARKER_Y, playerGeometry } from './figure'
import { TalkPrompt } from './TalkPrompt'
import { listenForWalkKeys } from './walk-keys'
import { createPlayer, sendPlayer, tickPlayer } from './walking'

describe('listenForWalkKeys', () => {
  let stop = (): void => {}
  afterEach(() => {
    stop()
    document.body.replaceChildren()
  })

  function setup() {
    const player = createPlayer({ x: 0, z: 0 })
    const onTalk = vi.fn()
    const onChange = vi.fn()
    stop = listenForWalkKeys({ player, onTalk, onChange })
    return { player, onTalk, onChange }
  }

  it('holds a walking key while it is down and asks for a frame', () => {
    const { player, onChange } = setup()
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    fireEvent.keyDown(window, { key: 'D' })
    expect([...player.held]).toEqual(['ArrowUp', 'd'])
    expect(onChange).toHaveBeenCalledTimes(2)
    fireEvent.keyUp(window, { key: 'ArrowUp' })
    expect([...player.held]).toEqual(['d'])
  })

  it('keeps the page from scrolling on an arrow key', () => {
    setup()
    expect(fireEvent.keyDown(window, { key: 'ArrowDown' })).toBe(false)
  })

  it('selects the agent beside the player on X', () => {
    const { onTalk } = setup()
    fireEvent.keyDown(window, { key: 'x' })
    expect(onTalk).toHaveBeenCalledOnce()
  })

  it('does nothing while focus is in a text field', () => {
    const { player, onTalk } = setup()
    const field = document.createElement('input')
    document.body.append(field)
    fireEvent.keyDown(field, { key: 'w' })
    fireEvent.keyDown(field, { key: 'x' })
    expect(player.held.size).toBe(0)
    expect(onTalk).not.toHaveBeenCalled()
  })
  it('stops held movement when focus transfers into an input in the same window', () => {
    const { player } = setup()
    fireEvent.keyDown(window, { key: 'w' })
    tickPlayer(player, { isOpen: () => true }, 1 / 60, 0)
    const before = { ...player.position }
    const field = document.createElement('input')
    document.body.append(field)
    field.focus()
    tickPlayer(player, { isOpen: () => true }, 1 / 60, 0)
    expect(player.position).toEqual(before)
    expect(player.held.size).toBe(0)
  })
  it('does not steal movement or inspection keys while a modal owns the keyboard', () => {
    const { player, onTalk } = setup()
    const modal = document.createElement('div')
    modal.setAttribute('aria-modal', 'true')
    document.body.append(modal)
    fireEvent.keyDown(window, { key: 'w' })
    fireEvent.keyDown(window, { key: 'x' })
    expect(player.held.size).toBe(0)
    expect(onTalk).not.toHaveBeenCalled()
  })

  it('does nothing while focus is in a HUD panel that scrolls', () => {
    const { player } = setup()
    const panel = document.createElement('div')
    panel.style.overflowY = 'auto'
    Object.defineProperty(panel, 'scrollHeight', { value: 500 })
    Object.defineProperty(panel, 'clientHeight', { value: 100 })
    const button = document.createElement('button')
    panel.append(button)
    document.body.append(panel)
    fireEvent.keyDown(button, { key: 'ArrowUp' })
    expect(player.held.size).toBe(0)
  })

  it('ignores a key pressed with a modifier', () => {
    const { player } = setup()
    fireEvent.keyDown(window, { key: 'a', metaKey: true })
    expect(player.held.size).toBe(0)
  })

  it('lets every key go when the window loses focus or walking ends', () => {
    const { player } = setup()
    fireEvent.keyDown(window, { key: 'w' })
    fireEvent.blur(window)
    expect(player.held.size).toBe(0)
    fireEvent.keyDown(window, { key: 'w' })
    stop()
    expect(player.held.size).toBe(0)
    fireEvent.keyDown(window, { key: 'w' })
    expect(player.held.size).toBe(0)
  })
})

describe('sendPlayer', () => {
  it('sets where to go and wakes the scene', () => {
    const player = createPlayer({ x: 0, z: 0 })
    player.onGoal = vi.fn()
    sendPlayer(player, { x: 4, z: 2 })
    expect(player.goal).toEqual({ x: 4, z: 2 })
    expect(player.onGoal).toHaveBeenCalledOnce()
  })
})

describe('playerGeometry', () => {
  it('hangs a pointer over the player so it is found among the buildings', () => {
    const geometry = playerGeometry(EDO)
    geometry.computeBoundingBox()
    expect(geometry.boundingBox?.max.y).toBeCloseTo(MARKER_Y + 0.25)
  })

  it('is one coloured mesh that stands on the ground, taller than an agent', () => {
    const geometry = playerGeometry(EDO)
    const positions = geometry.getAttribute('position')
    expect(geometry.getAttribute('color').count).toBe(positions.count)
    expect(geometry.getAttribute('normal').count).toBe(positions.count)
    geometry.computeBoundingBox()
    expect(geometry.boundingBox?.min.y).toBeGreaterThan(-1e-6)
    // The figure itself is under 2 m; only the pointer over its head reaches higher.
    expect(geometry.boundingBox?.max.y).toBeGreaterThan(1.3)
    expect(geometry.boundingBox?.max.y).toBeLessThan(MARKER_Y + 0.3)
  })

  it('has a ring under its feet, wider than the figure', () => {
    const geometry = playerGeometry(EDO)
    const positions = geometry.getAttribute('position')
    let ringReach = 0
    let bodyReach = 0
    for (let index = 0; index < positions.count; index++) {
      const reach = Math.hypot(positions.getX(index), positions.getZ(index))
      if (positions.getY(index) < 0.2) ringReach = Math.max(ringReach, reach)
      else bodyReach = Math.max(bodyReach, reach)
    }
    expect(ringReach).toBeGreaterThan(bodyReach)
  })
})

describe('TalkPrompt', () => {
  it('names the key and the agent it would select', () => {
    render(<TalkPrompt label="office renderer" />)
    expect(screen.getByText('X')).toBeInTheDocument()
    expect(screen.getByText(/office renderer/)).toBeInTheDocument()
  })
})
