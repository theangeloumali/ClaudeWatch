import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { VenuesPanel } from '../../hud/VenuesPanel'
import { makeAgent, makeFrame, makeSession } from '../fixtures'

it('exposes actual venue visitors for one-action inspection, without claiming work', () => {
  const onSelectAgent = vi.fn()
  const session = makeSession({ key: 'one', name: 'Visitor one' })
  const frame = makeFrame({
    sessions: [session],
    agents: [{ ...makeAgent({ agentKey: session.key }), venueId: 'arcade' }],
    venues: [
      {
        id: 'arcade',
        displayName: 'Arcade',
        kind: 'arcade',
        footprint: { x: 0, z: 0, width: 10, depth: 10 },
        entrance: { x: 0, z: -5 },
        capacity: 1,
        slots: [{ id: 'seat', x: 0, z: 0, heading: 0 }]
      }
    ]
  })
  render(
    <VenuesPanel
      frame={frame}
      selectedVenueId="arcade"
      onSelectVenue={vi.fn()}
      onSelectAgent={onSelectAgent}
    />
  )
  expect(screen.getByText(/Present: 1/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Inspect Visitor one' }))
  expect(onSelectAgent).toHaveBeenCalledWith(session.key)
  expect(screen.getByText(/not a work report/)).toBeInTheDocument()
})
