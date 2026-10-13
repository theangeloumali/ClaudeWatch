import { agentKey } from '../../../shared/office/agent-key'
import type {
  FocusResult,
  InteractionFailure,
  SessionHost,
  SessionRef,
  SubagentRef
} from '../../../shared/office/types'

export const MAX_MESSAGE_CHARS = 4000

// Talk and peek drive the agent's own Orca pane: null when it can be reached, else why not.
export function reachBlocker(
  target: Pick<ReachTarget, 'host' | 'hasPane'>
): InteractionFailure | null {
  if (target.host !== 'orca') return 'not-in-orca'
  return target.hasPane ? null : 'terminal-not-found'
}

export function canRespond(session: Pick<SessionRef, 'host' | 'provider' | 'attention'>): boolean {
  return (
    session.host === 'orca' && session.provider === 'claude' && session.attention === 'permission'
  )
}

export function isTeammate(member: SubagentRef | undefined): member is SubagentRef {
  return member?.kind === 'teammate'
}

// Who Focus terminal, Talk and Peek act on for a selected agent.
export interface ReachTarget {
  key: string
  name: string
  host: SessionHost
  // False for an Orca agent whose pane another process claimed.
  hasPane: boolean
  // False only for a teammate, which has a terminal of its own.
  isLead: boolean
}

// A teammate has a process and a pane of its own; a subagent shares its lead's.
export function reachTarget(session: SessionRef, member: SubagentRef | undefined): ReachTarget {
  if (!isTeammate(member)) {
    return {
      key: session.key,
      name: session.name,
      host: session.host,
      hasPane: session.orcaPaneKey !== null,
      isLead: true
    }
  }
  return {
    key: agentKey(session.key, member.id),
    name: member.name ?? member.type,
    host: member.orcaPaneKey ? 'orca' : session.host,
    hasPane: Boolean(member.orcaPaneKey),
    isLead: false
  }
}

const FAILURE_COPY: Record<InteractionFailure, string> = {
  'not-in-orca': 'This agent runs in a plain terminal. Use Focus terminal to reply there.',
  'orca-unavailable': "Orca isn't responding. Check that it's running.",
  'terminal-not-found': "Couldn't find this agent's Orca pane. It may have closed.",
  'no-permission-prompt': 'No permission prompt is showing for this agent right now.',
  'prompt-on-screen':
    "This agent's terminal is not at its input line, so a message could answer a prompt instead. Focus its terminal first.",
  'prompt-changed': 'The prompt changed since you reviewed it. Review it again.',
  'unsupported-provider':
    'Answering prompts from the office works for Claude agents. Focus the terminal for Codex and OpenCode.',
  'invalid-input': 'Type a message first (up to 4000 characters).',
  'unknown-session': 'This agent has left the office.',
  'not-permitted': 'This page is view-only. Start it with --interactive to act on agents.',
  'agent-not-found': "Couldn't find claude or codex on your PATH."
}

export function failureMessage(reason: InteractionFailure | undefined): string {
  return reason ? FAILURE_COPY[reason] : "That didn't go through. Try again."
}

// Empty when the agent's own pane came forward: the owner is looking at it, nothing to add.
export function focusMessage(result: FocusResult): string {
  if (result.target === 'app') {
    return `Orca is in front, but not on this agent's pane. ${failureMessage(result.reason)}`
  }
  if (!result.success) return failureMessage(result.reason)
  if (result.target === 'terminal-app') return "This agent's terminal app is in front."
  return result.target === 'terminal' ? "Opened a terminal at this agent's folder." : ''
}

export function messageProblem(text: string): InteractionFailure | null {
  const trimmed = text.trim()
  return trimmed.length === 0 || trimmed.length > MAX_MESSAGE_CHARS ? 'invalid-input' : null
}
