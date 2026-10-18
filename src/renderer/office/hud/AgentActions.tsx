import { needsHuman } from '../../../shared/office/attention'
import { parseAgentKey } from '../../../shared/office/agent-key'
import type { InteractionFailure, SessionRef } from '../../../shared/office/types'
import { canRespond, failureMessage, reachBlocker, type ReachTarget } from '../logic/interactions'
import type { OfficeFeed } from '../scene-model'
import { PeekPanel } from './PeekPanel'
import { PermissionPanel } from './PermissionPanel'
import { TalkBox } from './TalkBox'
import { WorkOrderNote } from './WorkOrderNote'

interface AgentActionsProps {
  session: SessionRef
  // The session itself, or the teammate selected within it.
  target: ReachTarget
  feed: OfficeFeed
  isReviewing: boolean
  onReview: () => void
  onReviewClose: () => void
  onFocusTerminal: () => void
  onSent: (agentKey: string) => void
  selectedAgentKey?: string
}

// The work order, talk, review and peek for the inspected agent, each shown only when it applies.
export function AgentActions({
  session,
  target,
  feed,
  isReviewing,
  onReview,
  onReviewClose,
  onFocusTerminal,
  onSent,
  selectedAgentKey
}: AgentActionsProps) {
  const isOwnSession = target.isLead
  // Mounted while reviewing even after the prompt clears, so the panel itself closes the review.
  const isReviewOpen =
    isOwnSession && isReviewing && canRespond({ ...session, attention: 'permission' })
  const { attention } = session
  const waitingOn = needsHuman(attention) ? attention : null
  const isViewOnly = feed.isViewOnly === true
  const terminalMember = parseAgentKey(target.key, [session])?.member
  // A typed message would answer the agent's open dialog (Enter confirms its default), so no box.
  const talkBlocker = ((): InteractionFailure | null => {
    if (isViewOnly) return 'not-permitted'
    if (isOwnSession && waitingOn) return 'prompt-on-screen'
    return reachBlocker(target)
  })()
  return (
    <div className="flex flex-col gap-3">
      {isReviewOpen && (
        <PermissionPanel
          session={session}
          peek={feed.peek}
          respond={feed.respond}
          onClose={onReviewClose}
        />
      )}
      {isOwnSession && waitingOn && !isReviewOpen && (
        <WorkOrderNote
          attention={waitingOn}
          sessionName={session.name}
          sinceMs={session.updatedAtMs}
          onAction={!isViewOnly && canRespond(session) ? onReview : onFocusTerminal}
        />
      )}
      {talkBlocker ? (
        <p className="text-xs text-text-secondary">{failureMessage(talkBlocker)}</p>
      ) : (
        <TalkBox agentKey={target.key} agentName={target.name} send={feed.send} onSent={onSent} />
      )}
      <PeekPanel
        agentKey={target.key}
        selectedAgentKey={selectedAgentKey}
        peek={feed.peek}
        isViewOnly={isViewOnly}
        paneKey={target.isLead ? session.orcaPaneKey : terminalMember?.orcaPaneKey}
        incarnationKey={JSON.stringify([
          session.sessionId,
          session.pid,
          session.startedAtMs,
          session.cwd,
          terminalMember?.pid,
          terminalMember?.startedAtMs
        ])}
        disabledReason={
          reachBlocker(target) ? 'A verified Orca terminal is required for capture.' : undefined
        }
      />
    </div>
  )
}
