import { SquareTerminal } from 'lucide-react'
import type { ReactNode } from 'react'
import type {
  AccountRef,
  AgentView,
  SessionHost,
  SessionRef,
  SubagentRef
} from '../../../shared/office/types'
import {
  BUTTON_PRIMARY_COMPACT_CLASS,
  BUTTON_QUIET_COMPACT_CLASS
} from '../../components/deck/deck-styles'
import { Plate } from '../../components/deck/Plate'
import { StateMark } from '../../components/deck/StateMark'
import { stateOfAttention } from '../../deck/roster'
import { useOfficeNow } from '../use-office-now'
import { formatElapsedTime } from '../../lib/utils'
import { isTeammate, reachTarget } from '../logic/interactions'
import { PROVIDER_LABEL } from '../office-palette'
import type { RosterEntry } from '../themes/types'
import { accountText } from './agent-facts'
import { Fact } from './Fact'
import { KBD_INK_CLASS } from './hud-styles'
import { MemberTokenFacts, SessionTokenFacts } from './TokenFacts'
import { InspectorControls, InspectorPanel } from './InspectorPanel'
import { InspectorResizer } from './InspectorResizer'
import { useInspectorPanel, type InspectorPanelController } from './use-inspector-panel'

interface InspectorProps {
  agent: AgentView
  session: SessionRef | undefined
  // Set when the agent is a subagent or teammate of `session`.
  member: SubagentRef | undefined
  // The snapshot's accounts; the row is left out until the session's account is among them.
  accounts?: readonly AccountRef[]
  // Who the agent plays in its office's theme, where that theme has a cast.
  character: RosterEntry | null
  canFly: boolean
  onFocusTerminal: () => void
  onFly: () => void
  canWorkstation?: boolean
  onWorkstation?: () => void
  onClose: () => void
  // Interaction panels (work order, talk, review, peek) composed in by the caller.
  children?: ReactNode
  // Replaces legacy activity/tool facts when composed with LiveWork.
  evidenceSlot?: ReactNode
  panel?: InspectorPanelController
}

const HOST_LABEL: Record<SessionHost, string> = {
  orca: 'Orca',
  terminal: 'Terminal',
  vscode: 'VS Code',
  unknown: 'Unknown'
}

function crewLine(session: SessionRef, member: SubagentRef | undefined): string {
  return `${isTeammate(member) ? 'Teammate' : 'Subagent'} of ${session.name}`
}

// Ticks here, so a passing second re-renders this row and not the Office around it.
function ElapsedFact({ startedAtMs }: { startedAtMs: number | undefined }) {
  const nowMs = useOfficeNow()
  const elapsedSeconds =
    startedAtMs === undefined ? 0 : Math.max(0, Math.floor((nowMs - startedAtMs) / 1000))
  return <Fact term="Elapsed" value={formatElapsedTime(elapsedSeconds)} />
}

export function Inspector(props: InspectorProps) {
  if (!props.panel) return <StandaloneInspector {...props} />
  return <InspectorContent {...props} panel={props.panel} />
}

function StandaloneInspector(props: InspectorProps) {
  const panel = useInspectorPanel(props.agent.agentKey, 0)
  return <InspectorContent {...props} panel={panel} />
}

function InspectorContent({
  agent,
  session,
  member,
  accounts,
  character,
  canFly,
  onFocusTerminal,
  onFly,
  canWorkstation,
  onWorkstation,
  onClose,
  children,
  evidenceSlot,
  panel
}: InspectorProps & { panel: InspectorPanelController }) {
  const mark = stateOfAttention(agent.attention, agent.activity)
  const account = accountText(session, accounts)
  // A child without model metadata must not borrow its parent's selection.
  const selectedModel = agent.isSubagent ? member?.selectedModel : session?.selectedModel
  const selectedModelLabel = selectedModel
    ? `${selectedModel.providerId} / ${selectedModel.modelId}${selectedModel.variant ? ` · ${selectedModel.variant}` : ''}`
    : 'Unavailable'
  return (
    <InspectorPanel panel={panel}>
      <Plate
        className="flex max-h-[inherit] min-h-0 flex-col"
        faceClassName="flex min-h-0 flex-col overflow-hidden"
      >
        <InspectorResizer panel={panel} />
        <div className="flex shrink-0 flex-wrap items-start gap-2 p-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="break-words pt-[3px] font-plate text-count text-text-primary">
              {agent.label}
            </h2>
            {agent.isSubagent && session && (
              <p className="text-xs text-text-secondary">{crewLine(session, member)}</p>
            )}
            {character && (
              <p className="text-xs text-text-secondary">
                <span className="font-semibold text-gold">{character.name}</span>
                <span className="block">{character.role}</span>
              </p>
            )}
            {!evidenceSlot && <StateMark state={mark.state} detail={mark.detail} />}
          </div>
          <InspectorControls panel={panel} onClose={onClose} />
        </div>
        <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-auto overscroll-contain px-3 pb-3">
          {evidenceSlot}
          <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1">
            <Fact term="Project" value={session?.projectLabel ?? 'Unknown'} />
            <Fact term="Provider" value={PROVIDER_LABEL[agent.provider]} />
            {agent.provider === 'opencode' && (
              <Fact term="Selected model" value={selectedModelLabel} isWrapping />
            )}
            {account && <Fact term="Account" value={account} />}
            {member && <Fact term="Agent type" value={member.type} />}
            {!evidenceSlot && <Fact term="Activity" value={agent.activity} />}
            {!evidenceSlot && !agent.isSubagent && (
              <Fact term="Tool" value={session?.currentTool?.name ?? 'None'} />
            )}
            {session && (
              <Fact term="Terminal" value={HOST_LABEL[reachTarget(session, member).host]} />
            )}
            <ElapsedFact startedAtMs={member?.startedAtMs ?? session?.startedAtMs} />
            {member && <MemberTokenFacts member={member} />}
            {!agent.isSubagent && session && <SessionTokenFacts session={session} />}
          </dl>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!session}
              aria-keyshortcuts="F"
              onClick={onFocusTerminal}
              className={BUTTON_PRIMARY_COMPACT_CLASS}
            >
              <SquareTerminal aria-hidden="true" className="size-3.5" />
              Focus terminal
              <kbd aria-hidden="true" className={KBD_INK_CLASS}>
                F
              </kbd>
            </button>
            {canFly && (
              <button type="button" onClick={onFly} className={BUTTON_QUIET_COMPACT_CLASS}>
                Fly to
              </button>
            )}
            {onWorkstation && (
              <button
                type="button"
                disabled={!canWorkstation}
                onClick={onWorkstation}
                className={BUTTON_QUIET_COMPACT_CLASS}
              >
                Workstation
              </button>
            )}
          </div>
          {children}
        </div>
      </Plate>
    </InspectorPanel>
  )
}
