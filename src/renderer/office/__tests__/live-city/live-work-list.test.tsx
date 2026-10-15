import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ListView } from '../../hud/ListView'
import { makeAgent, makeFrame, makeSession } from '../fixtures'

const NOW = 1_000_000
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('filters real identities and reports only member tool and freshness', () => {
  const onSelectAgent = vi.fn()
  const agents = [
    makeAgent({ agentKey: 'claude:a', label: 'Lead' }),
    makeAgent({ agentKey: 'claude:a#member', label: 'Member', isSubagent: true })
  ]
  render(
    <ListView
      companies={[
        {
          companyKey: 'company',
          label: 'Company',
          projects: [
            {
              projectKey: 'project',
              label: 'Project',
              agents
            }
          ]
        }
      ]}
      agentFacts={new Map()}
      selectedAgentKey={null}
      onSelectAgent={onSelectAgent}
      onFocusTerminal={vi.fn()}
      frame={makeFrame({
        agents,
        sessions: [
          makeSession({
            key: 'claude:a',
            currentTool: { name: 'LEAD_ONLY', category: 'run' },
            subagents: [
              {
                id: 'member',
                type: 'Explore',
                activity: 'reading',
                attention: 'none',
                currentTool: { name: 'Read', category: 'read' },
                observation: {
                  sourceId: 'own',
                  observedAtMs: NOW,
                  staleAfterMs: 60000,
                  coverage: 'own'
                }
              }
            ]
          })
        ]
      })}
    />
  )
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search agents' }), {
    target: { value: 'claude:a#member' }
  })
  const row = screen.getByRole('button', { name: /^Member/ }).closest('tr')
  expect(row).not.toBeNull()
  if (!row) throw new Error('Member row is missing')
  expect(within(row).getByText('Read')).toBeInTheDocument()
  expect(within(row).getByText('fresh')).toBeInTheDocument()
  expect(row).not.toHaveTextContent('LEAD_ONLY')
  fireEvent.click(within(row).getByRole('button', { name: /^Member/ }))
  expect(onSelectAgent).toHaveBeenCalledWith('claude:a#member')
  fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'stale' } })
  expect(screen.getByRole('status')).toHaveTextContent('No agents match these filters.')
})
