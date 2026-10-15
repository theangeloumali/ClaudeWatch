import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { WorldTargetMenu } from '../../editor/WorldTargetMenu'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession } from '../fixtures'

it('offers exact local editing and manual agent inspection without invoking provider commands', () => {
  const onEdit = vi.fn()
  const onSelectAgent = vi.fn()
  const session = makeSession({ key: 'claude:one', name: 'Worker one' })
  const room = makeRoom({ id: 'room:one', sessionKey: session.key, label: 'Window room' })
  const frame = makeFrame({
    sessions: [session],
    agents: [makeAgent({ agentKey: session.key, roomId: room.id })],
    floors: [makeFloor({ floorId: 'f1', rooms: [room] })]
  })
  render(
    <WorldTargetMenu
      frame={frame}
      target={{ kind: 'room', id: room.id, clientX: 40, clientY: 40 }}
      onEdit={onEdit}
      onSelectAgent={onSelectAgent}
      onClose={vi.fn()}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Inspect Worker one' }))
  expect(onSelectAgent).toHaveBeenCalledWith(session.key)
  fireEvent.click(screen.getByRole('button', { name: 'Move room' }))
  expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: room.id }), 'Room X')
})
