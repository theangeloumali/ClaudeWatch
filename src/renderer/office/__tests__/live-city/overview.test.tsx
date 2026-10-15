import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FloorOverview } from '../../hud/FloorOverview'
import { makeAgent, makeFloor, makeFrame, makeRoom, makeSession } from '../fixtures'

const NOW = 1_000_000
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('keeps empty upper floors visible, distinguishes presence from fresh work, and selects exact identities', () => {
  const onFocusFloor = vi.fn()
  const onSelectAgent = vi.fn()
  render(
    <FloorOverview
      onFocusFloor={onFocusFloor}
      onSelectAgent={onSelectAgent}
      frame={makeFrame({
        floors: [
          makeFloor({ floorId: 'tower:2', label: 'Upper 2' }),
          makeFloor({
            floorId: 'tower:0',
            label: 'Ground',
            rooms: [makeRoom({ id: 'room', sessionKey: 'claude:a' })]
          }),
          makeFloor({ floorId: 'tower:1', label: 'Upper 1' })
        ],
        sessions: [
          makeSession({
            key: 'claude:a',
            name: 'Worker',
            activity: 'editing',
            attention: 'permission',
            observation: {
              sourceId: 'own',
              observedAtMs: NOW,
              staleAfterMs: 60000,
              coverage: 'own'
            }
          })
        ],
        agents: [makeAgent({ agentKey: 'claude:a', floorId: 'tower:0', label: 'Worker' })]
      })}
    />
  )
  const region = screen.getByRole('region', { name: 'Floors at a glance' })
  expect(within(region).getByRole('button', { name: 'Focus Ground' })).toBeInTheDocument()
  expect(within(region).getByRole('button', { name: 'Focus Upper 1' })).toBeInTheDocument()
  expect(within(region).getByRole('button', { name: 'Focus Upper 2' })).toBeInTheDocument()
  expect(region).toHaveTextContent('1 assigned')
  expect(region).toHaveTextContent('1 present')
  expect(region).toHaveTextContent('0 fresh working')
  expect(region).toHaveTextContent('1 attention')
  fireEvent.click(within(region).getByRole('button', { name: 'Focus Ground' }))
  expect(onFocusFloor).toHaveBeenCalledWith('tower:0')
  fireEvent.click(within(region).getByRole('button', { name: /Inspect Worker.*claude:a/ }))
  expect(onSelectAgent).toHaveBeenCalledWith('claude:a')
  expect(region).toHaveTextContent('Most populated: Ground')
  expect(region).toHaveTextContent('Busiest: No fresh working reports')
})

it('retains stale attention as last known and never reports disconnected activity as zero', () => {
  const frame = makeFrame({
    floors: [
      makeFloor({ floorId: 'ground', rooms: [makeRoom({ id: 'room', sessionKey: 'claude:a' })] })
    ],
    sessions: [
      makeSession({
        key: 'claude:a',
        attention: 'error',
        observation: {
          sourceId: 'own',
          observedAtMs: NOW - 60000,
          staleAfterMs: 60000,
          coverage: 'own'
        }
      })
    ],
    agents: [makeAgent({ agentKey: 'claude:a', floorId: 'ground' })]
  })
  const { rerender } = render(
    <FloorOverview frame={frame} onFocusFloor={vi.fn()} onSelectAgent={vi.fn()} />
  )
  expect(screen.getByRole('region', { name: 'Floors at a glance' })).toHaveTextContent(
    '1 last-known attention'
  )
  rerender(
    <FloorOverview
      frame={{ ...frame, connected: false }}
      onFocusFloor={vi.fn()}
      onSelectAgent={vi.fn()}
    />
  )
  const region = screen.getByRole('region', { name: 'Floors at a glance' })
  expect(region).toHaveTextContent('Disconnected')
  expect(region).toHaveTextContent('fresh working unknown')
  expect(region).not.toHaveTextContent('0 fresh working')
})

it('names tied positive winners without selecting a false winner', () => {
  const floors = ['a', 'b'].map((floorId) =>
    makeFloor({
      floorId,
      label: floorId.toUpperCase(),
      rooms: [makeRoom({ id: floorId, sessionKey: `claude:${floorId}` })]
    })
  )
  render(
    <FloorOverview
      frame={makeFrame({
        floors,
        sessions: ['a', 'b'].map((identity) =>
          makeSession({
            key: `claude:${identity}`,
            activity: 'reading',
            observation: {
              sourceId: 'own',
              observedAtMs: NOW,
              staleAfterMs: 60000,
              coverage: 'own'
            }
          })
        ),
        agents: ['a', 'b'].map((identity) =>
          makeAgent({ agentKey: `claude:${identity}`, floorId: identity })
        )
      })}
      onFocusFloor={vi.fn()}
      onSelectAgent={vi.fn()}
    />
  )
  expect(screen.getByText(/Most populated: A, B \(tie, 1 present\)/)).toBeInTheDocument()
  expect(screen.getByText(/Busiest: A, B \(tie, 1 fresh working\)/)).toBeInTheDocument()
})
