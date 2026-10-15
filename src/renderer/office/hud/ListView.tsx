import { useId, useState } from 'react'
import { observeAgent } from '../../../shared/office/observation'
import { Plate } from '../../components/deck/Plate'
import { useNow } from '../../hooks/useNow'
import { cn } from '../../lib/utils'
import type { CompanyListEntry } from '../logic/zone-model'
import type { OfficeFrame } from '../scene-model'
import { PROVIDER_LABEL } from '../office-palette'
import type { AgentFacts } from './agent-facts'
import { FIELD_CLASS } from './hud-styles'
import { ListAgentRow } from './ListAgentRow'

export interface ListViewProps {
  companies: readonly CompanyListEntry[]
  agentFacts: ReadonlyMap<string, AgentFacts>
  selectedAgentKey: string | null
  onSelectAgent: (agentKey: string) => void
  onFocusTerminal: (agentKey: string) => void
  frame?: OfficeFrame
}

const CELL_CLASS = 'px-3 py-1.5 text-left align-middle'
const LEGACY_HEADINGS = ['Name', 'Provider', 'Activity', 'Status', 'Tokens', 'Terminal']
const LIVE_HEADINGS = [
  'Name',
  'Provider',
  'Reported activity',
  'Reported attention',
  'Freshness',
  'Tool',
  'Tokens',
  'Terminal'
]

export function ListView({
  companies,
  agentFacts,
  selectedAgentKey,
  onSelectAgent,
  onFocusTerminal,
  frame
}: ListViewProps) {
  const [query, setQuery] = useState('')
  const [provider, setProvider] = useState('all')
  const [status, setStatus] = useState('all')
  const searchId = useId()
  const providerId = useId()
  const statusId = useId()
  const nowMs = useNow(1000)
  const headings = frame ? LIVE_HEADINGS : LEGACY_HEADINGS
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredCompanies = companies
    .map((company) => ({
      ...company,
      projects: company.projects
        .map((project) => ({
          ...project,
          agents: project.agents.filter((agent) => {
            const evidence = frame
              ? observeAgent({ ...frame, agentKey: agent.agentKey, nowMs })
              : undefined
            const attention = frame ? (evidence?.attention ?? 'unknown') : agent.attention
            const searchable = [
              agent.label,
              agent.agentKey,
              company.label,
              project.label,
              PROVIDER_LABEL[agent.provider],
              frame ? (evidence?.activity ?? 'unknown') : agent.activity,
              attention,
              evidence?.status,
              evidence?.currentTool?.name
            ]
              .join(' ')
              .toLocaleLowerCase()
            return (
              (provider === 'all' || provider === agent.provider) &&
              (status === 'all' || status === attention || status === evidence?.status) &&
              searchable.includes(normalizedQuery)
            )
          })
        }))
        .filter((project) => project.agents.length > 0)
    }))
    .filter((company) => company.projects.length > 0)

  return (
    <Plate
      className="h-full min-w-0 max-w-full"
      faceClassName="flex min-w-0 flex-col overflow-hidden"
    >
      <div
        role="search"
        aria-label="Filter agents"
        className="flex shrink-0 flex-wrap items-end gap-2 border-b border-border p-3"
      >
        <label htmlFor={searchId} className="min-w-0 flex-1 text-xs text-text-secondary">
          Search agents
          <input
            id={searchId}
            name="agent-search"
            type="search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={cn(FIELD_CLASS, 'mt-1 block w-full')}
            placeholder="Name, key or status…"
          />
        </label>
        <label htmlFor={providerId} className="text-xs text-text-secondary">
          Provider
          <select
            id={providerId}
            name="agent-provider"
            autoComplete="off"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            className={cn(FIELD_CLASS, 'mt-1 block')}
          >
            <option value="all">All providers</option>
            {Object.entries(PROVIDER_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={statusId} className="text-xs text-text-secondary">
          Status
          <select
            id={statusId}
            name="agent-status"
            autoComplete="off"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className={cn(FIELD_CLASS, 'mt-1 block')}
          >
            <option value="all">All statuses</option>
            {[
              'permission',
              'question',
              'error',
              'done',
              'limited',
              'none',
              ...(frame ? ['fresh', 'stale', 'unknown', 'disconnected'] : [])
            ].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="min-h-0 min-w-0 overflow-auto overscroll-contain">
        <table className="w-full border-collapse text-body">
          <caption className="sr-only">Agents by company and project</caption>
          <thead className="sticky top-0 z-10 bg-surface-raised text-caption text-text-secondary">
            <tr>
              {headings.map((heading) => (
                <th key={heading} scope="col" className={cn(CELL_CLASS, 'font-medium')}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          {filteredCompanies.map((company) => (
            <tbody key={company.companyKey} className="border-t border-border">
              <tr>
                <th
                  scope="rowgroup"
                  colSpan={headings.length}
                  className={cn(
                    CELL_CLASS,
                    'break-words pt-3 font-plate text-title text-text-primary'
                  )}
                >
                  {company.label}
                </th>
              </tr>
              {company.projects.map((project) => [
                <tr key={project.projectKey}>
                  <th
                    scope="row"
                    colSpan={headings.length}
                    className={cn(CELL_CLASS, 'break-words pl-8 font-semibold text-text-secondary')}
                  >
                    {project.label}
                  </th>
                </tr>,
                ...project.agents.map((agent) => (
                  <ListAgentRow
                    key={agent.agentKey}
                    agent={agent}
                    facts={agentFacts.get(agent.agentKey)}
                    isSelected={agent.agentKey === selectedAgentKey}
                    onSelectAgent={onSelectAgent}
                    onFocusTerminal={onFocusTerminal}
                    frame={frame}
                    nowMs={nowMs}
                  />
                ))
              ])}
            </tbody>
          ))}
        </table>
        {filteredCompanies.length === 0 && (
          <p role="status" className="p-3 text-body text-text-secondary">
            No agents match these filters.
          </p>
        )}
      </div>
    </Plate>
  )
}
