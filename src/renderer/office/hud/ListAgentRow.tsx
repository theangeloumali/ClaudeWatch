import { SquareTerminal } from 'lucide-react'
import { observeAgent } from '../../../shared/office/observation'
import type { AgentView } from '../../../shared/office/types'
import { ICON_BUTTON_CLASS } from '../../components/deck/deck-styles'
import { StateMark } from '../../components/deck/StateMark'
import { stateOfAttention } from '../../deck/roster'
import { cn } from '../../lib/utils'
import { PROVIDER_LABEL } from '../office-palette'
import type { AgentFacts } from './agent-facts'
import type { ListViewProps } from './ListView'
import { tokensText } from './tokens'

interface ListAgentRowProps extends Pick<
  ListViewProps,
  'onSelectAgent' | 'onFocusTerminal' | 'frame'
> {
  agent: AgentView
  facts: AgentFacts | undefined
  isSelected: boolean
  nowMs: number
}

const CELL_CLASS = 'px-3 py-1.5 text-left align-middle'

// dry-new: extracted ListView row preserves its six-cell legacy API while rendering own evidence.
export function ListAgentRow({
  agent,
  facts,
  isSelected,
  onSelectAgent,
  onFocusTerminal,
  frame,
  nowMs
}: ListAgentRowProps) {
  const mark = stateOfAttention(agent.attention, agent.activity)
  const evidence = frame ? observeAgent({ ...frame, agentKey: agent.agentKey, nowMs }) : undefined
  const label = agent.label || agent.agentKey
  return (
    <tr className={cn(isSelected && 'bg-surface-hover')}>
      <td className={cn(CELL_CLASS, agent.isSubagent ? 'pl-[4.5rem]' : 'pl-12')}>
        <button
          type="button"
          aria-current={isSelected ? 'true' : undefined}
          title={agent.agentKey}
          onClick={() => onSelectAgent(agent.agentKey)}
          className="max-w-64 break-all rounded text-left text-text-primary hover:underline aria-[current=true]:font-semibold"
        >
          {label}
          {agent.isSubagent && (
            <span className="ml-1.5 text-caption font-normal text-text-secondary">
              {facts?.kind === 'teammate' ? 'teammate' : 'subagent'}
            </span>
          )}
        </button>
      </td>
      <td className={cn(CELL_CLASS, 'text-text-secondary')}>{PROVIDER_LABEL[agent.provider]}</td>
      <td className={cn(CELL_CLASS, 'text-text-secondary')}>
        {frame ? (evidence?.activity ?? 'Unknown') : agent.activity}
      </td>
      <td className={CELL_CLASS}>
        {frame ? (
          (evidence?.attention ?? 'Unknown')
        ) : (
          <StateMark state={mark.state} detail={mark.detail} />
        )}
      </td>
      {frame && (
        <>
          <td className={cn(CELL_CLASS, 'text-text-secondary')}>{evidence?.status ?? 'unknown'}</td>
          <td className={cn(CELL_CLASS, 'max-w-48 break-all text-text-secondary')}>
            {evidence?.currentTool?.name ?? 'Unknown'}
          </td>
        </>
      )}
      <td
        className={cn(
          CELL_CLASS,
          'tabular-nums',
          facts?.tokens == null ? 'text-text-secondary' : 'text-accent'
        )}
      >
        {tokensText(facts?.tokens ?? null)}
      </td>
      <td className={CELL_CLASS}>
        <button
          type="button"
          aria-label={`Focus terminal for ${label}`}
          title="Focus terminal"
          onClick={() => onFocusTerminal(facts?.focusKey ?? agent.agentKey)}
          className={ICON_BUTTON_CLASS}
        >
          <SquareTerminal aria-hidden="true" className="size-4" />
        </button>
      </td>
    </tr>
  )
}
