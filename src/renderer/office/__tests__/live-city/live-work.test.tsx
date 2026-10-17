import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { OfficeFeed } from '../../scene-model'
import { LiveWork } from '../../hud/LiveWork'
import { makeAgent, makeFrame, makeSession } from '../fixtures'

const NOW = 1_000_000
const feed: OfficeFeed = {
  subscribe: () => () => undefined,
  focus: vi.fn(async () => ({ success: true })),
  send: vi.fn(async () => ({ success: true })),
  respond: vi.fn(async () => ({ success: true })),
  peek: vi.fn(async () => ({ success: true, lines: [] })),
  start: vi.fn(async () => ({ success: true }))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.clearAllMocks()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('uses the render wall clock for evidence received between display ticks without trusting future data', () => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  const record = makeSession({
    key: 'one',
    observation: {
      sourceId: 'test',
      observedAtMs: NOW,
      staleAfterMs: 10000,
      coverage: 'own'
    }
  })
  const frame = makeFrame({
    sessions: [record],
    sources: [{ id: 'test', ok: true, detail: 'healthy', checkedAtMs: NOW, staleAfterMs: 10000 }]
  })
  const { rerender } = render(<LiveWork frame={frame} agentKey={record.key} feed={feed} />)
  expect(screen.getByText('Fresh', { exact: true })).toBeInTheDocument()
  vi.setSystemTime(NOW + 800)
  const updated = {
    ...frame,
    sessions: [{ ...record, observation: { ...record.observation!, observedAtMs: NOW + 800 } }],
    sources: [{ ...frame.sources[0], checkedAtMs: NOW + 800 }]
  }
  rerender(<LiveWork frame={updated} agentKey={record.key} feed={feed} />)
  expect(screen.getByText('Fresh', { exact: true })).toBeInTheDocument()
  const future = {
    ...updated,
    sessions: [
      { ...updated.sessions[0], observation: { ...record.observation!, observedAtMs: NOW + 1800 } }
    ]
  }
  rerender(<LiveWork frame={future} agentKey={record.key} feed={feed} />)
  expect(
    screen.getByText('Unknown', { exact: true, selector: 'section > div > span' })
  ).toBeInTheDocument()
})

it('uses only the selected member report and keeps timestamps distinct without RPC', () => {
  const session = makeSession({
    key: 'claude:lead',
    host: 'orca',
    currentTool: { name: 'LEAD_ONLY', category: 'run' },
    updatedAtMs: NOW - 9000,
    observation: {
      sourceId: 'lead-source',
      observedAtMs: NOW,
      staleAfterMs: 60000,
      coverage: 'own'
    },
    subagents: [
      {
        id: 'member',
        type: 'Explore',
        activity: 'reading',
        attention: 'none',
        cwd: '/exact/member/path',
        startedAtMs: NOW - 10000,
        currentTool: { name: 'Read', category: 'read' },
        observation: {
          sourceId: 'member-source',
          observedAtMs: NOW - 2000,
          staleAfterMs: 60000,
          coverage: 'own'
        }
      }
    ]
  })
  render(
    <LiveWork
      agentKey="claude:lead#member"
      feed={feed}
      frame={makeFrame({
        sessions: [session],
        feedReceivedAtMs: NOW - 500,
        sources: [{ id: 'member-source', ok: true, detail: '', checkedAtMs: NOW - 1000 }]
      })}
    />
  )
  const region = screen.getByRole('region', { name: 'Live work' })
  expect(region).toHaveTextContent('Fresh')
  expect(region).toHaveTextContent('Reported activity')
  expect(region).toHaveTextContent('reading')
  expect(region).toHaveTextContent('Read')
  expect(region).not.toHaveTextContent('LEAD_ONLY')
  expect(region).toHaveTextContent('/exact/member/path')
  for (const label of ['Reported updated', 'Observed', 'Source checked', 'Feed received']) {
    expect(within(region).getByText(label)).toBeInTheDocument()
  }
  expect(within(region).getByText('Reported updated').nextElementSibling).toHaveTextContent(
    'Unknown'
  )
  expect(region).toHaveTextContent('claude:lead#member')
  expect(feed.peek).not.toHaveBeenCalled()
  expect(feed.focus).not.toHaveBeenCalled()
})

it('does not inherit lead source, tool, attention, or elapsed for an unobserved member', () => {
  render(
    <LiveWork
      agentKey="claude:lead#member"
      feed={feed}
      frame={makeFrame({
        sessions: [
          makeSession({
            key: 'claude:lead',
            activity: 'running',
            attention: 'permission',
            currentTool: { name: 'Bash', category: 'run' },
            observation: {
              sourceId: 'lead-source',
              observedAtMs: NOW,
              staleAfterMs: 60000,
              coverage: 'own'
            },
            subagents: [{ id: 'member', type: 'Explore', activity: 'idle' }]
          })
        ]
      })}
    />
  )
  const region = screen.getByRole('region', { name: 'Live work' })
  expect(region).toHaveTextContent('Unknown')
  expect(region).not.toHaveTextContent('Bash')
  expect(region).not.toHaveTextContent('lead-source')
  expect(within(region).getByText('Elapsed').nextElementSibling).toHaveTextContent('Unknown')
  expect(within(region).getByText('Reported attention').nextElementSibling).toHaveTextContent(
    'Unknown'
  )
})

it('labels stale and disconnected evidence without interpreting world placement as work', () => {
  const frame = makeFrame({
    agents: [makeAgent({ agentKey: 'claude:lead', place: 'lounge' })],
    sessions: [
      makeSession({
        key: 'claude:lead',
        activity: 'idle',
        observation: {
          sourceId: 'own',
          observedAtMs: NOW - 60000,
          staleAfterMs: 60000,
          coverage: 'own'
        }
      })
    ]
  })
  const { rerender } = render(<LiveWork frame={frame} agentKey="claude:lead" feed={feed} />)
  expect(screen.getByRole('region', { name: 'Live work' })).toHaveTextContent('Stale')
  expect(screen.getByText(/visual placement only/)).toHaveTextContent(/^Game corner — /)
  rerender(<LiveWork frame={{ ...frame, connected: false }} agentKey="claude:lead" feed={feed} />)
  expect(screen.getByRole('region', { name: 'Live work' })).toHaveTextContent('Disconnected')
})
