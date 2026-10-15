import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { officeSettings } from '../logic/office-settings'
import { OfficeApp } from '../OfficeApp'
import type { OfficeFeed } from '../scene-model'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession } from './fixtures'

vi.mock('../webgl-support', () => ({ canCreateWebGL2: () => true }))
vi.mock('../scene/OfficeScene', () => ({
  default: ({ isWalking }: { isWalking: boolean }) => (
    <p>Scene is {isWalking ? 'walking' : 'standing'}</p>
  )
}))

const frame = makeFrame({
  floors: [
    makeFloor({
      floorId: 'one',
      label: 'Office',
      rooms: [makeRoom({ id: 'r1', sessionKey: 'claude:b' })]
    })
  ],
  sessions: [makeSession({ key: 'claude:b' })],
  agents: [makeAgent({ agentKey: 'b1', floorId: 'one', roomId: 'r1' })]
})

function feed(isViewOnly = false): OfficeFeed {
  return {
    subscribe: (listener) => {
      listener(frame)
      return () => undefined
    },
    focus: vi.fn().mockResolvedValue({ success: true }),
    send: vi.fn(),
    respond: vi.fn(),
    peek: vi.fn(),
    start: vi.fn(),
    isViewOnly
  }
}

beforeEach(() => {
  localStorage.clear()
  officeSettings.reset()
})

const panel = (): HTMLElement | null => screen.queryByRole('dialog', { name: 'Office settings' })

it('opens and closes the settings with the comma key', async () => {
  render(<OfficeApp feed={feed()} />)
  await screen.findByText('Scene is standing')
  fireEvent.keyDown(window, { key: ',' })
  expect(panel()).not.toBeNull()
  fireEvent.keyDown(window, { key: ',' })
  expect(panel()).toBeNull()
  expect(screen.getByRole('button', { name: /^Settings/ })).toHaveFocus()
})

it('stops walking when the player is switched off, and does not resume when it is back', async () => {
  render(<OfficeApp feed={feed()} />)
  await screen.findByText('Scene is standing')
  fireEvent.keyDown(window, { key: 'g' })
  expect(screen.getByText('Scene is walking')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /^Settings/ }))
  fireEvent.click(screen.getByRole('switch', { name: 'Your character' }))
  expect(screen.getByText('Scene is standing')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Enable player' })).toBeInTheDocument()
  // Its key is gone with it.
  fireEvent.keyDown(window, { key: 'g' })
  expect(screen.getByText('Scene is standing')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('switch', { name: 'Your character' }))
  expect(screen.getByRole('button', { name: /Control player/ })).toHaveAttribute(
    'aria-pressed',
    'false'
  )
  expect(screen.getByText('Scene is standing')).toBeInTheDocument()
})

it('offers the settings on a view-only page too, and applies them there', async () => {
  render(<OfficeApp feed={feed(true)} />)
  await screen.findByText('Scene is standing')
  fireEvent.click(screen.getByRole('button', { name: /^Settings/ }))
  fireEvent.click(screen.getByRole('switch', { name: 'Town buildings' }))
  expect(officeSettings.get().town).toBe(false)
})

it('starts from the choices saved before the restart', async () => {
  act(() => officeSettings.set('player', false))
  render(<OfficeApp feed={feed()} />)
  await screen.findByText('Scene is standing')
  expect(screen.getByRole('button', { name: 'Enable player' })).toBeInTheDocument()
})
