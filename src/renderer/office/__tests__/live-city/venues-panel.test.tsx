import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { VenuesPanel } from '../../hud/VenuesPanel'
import { makeAgent, makeFrame, makeSession } from '../fixtures'

it('lists the city venues as places to look at, with no agent visitors to inspect', () => {
  const onSelectVenue = vi.fn()
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
  render(<VenuesPanel frame={frame} selectedVenueId="arcade" onSelectVenue={onSelectVenue} />)
  const venue = screen.getByRole('button', { name: 'Arcade · arcade' })
  expect(venue).toHaveAttribute('aria-pressed', 'true')
  expect(screen.queryByRole('button', { name: /Inspect/ })).not.toBeInTheDocument()
  expect(screen.queryByText(/Present|Last known|not a work report/)).not.toBeInTheDocument()
  fireEvent.click(venue)
  expect(onSelectVenue).toHaveBeenCalledWith('arcade')
})

it('names a venue saved without a display name by its kind alone', () => {
  const frame = makeFrame({
    venues: [
      {
        id: 'garage',
        kind: 'garage',
        footprint: { x: 0, z: 0, width: 10, depth: 10 },
        entrance: { x: 0, z: -5 },
        capacity: 1,
        slots: []
      }
    ]
  })
  render(<VenuesPanel frame={frame} selectedVenueId="garage" onSelectVenue={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'garage' })).toBeInTheDocument()
})
