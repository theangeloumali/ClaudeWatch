import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { WorldRoomFields } from '../../editor/WorldRoomFields'
import { makeRoom } from '../fixtures'

it('edits local presentation and real seat positions without calling a provider action', () => {
  const onChange = vi.fn()
  render(
    <WorldRoomFields
      room={makeRoom({ id: 'room', sessionKey: 'claude:one', label: 'Local name' })}
      onChange={onChange}
    />
  )
  fireEvent.change(screen.getByRole('textbox', { name: 'Room name' }), {
    target: { value: 'Window office' }
  })
  expect(onChange).toHaveBeenCalledWith({ label: 'Window office' })
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Room width' }), {
    target: { value: '10' }
  })
  expect(onChange).toHaveBeenCalledWith({ width: 10 })
  expect(screen.getByRole('group', { name: 'Desk positions' })).toBeInTheDocument()
})
