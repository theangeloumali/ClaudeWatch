import type { AgentActivity, AgentAttention, CurrentTool } from '../shared/office/types'
import { programName } from '../shared/platform-process'
import { isAgentCli } from './agent-cli'
import { isLabel } from './io'
import type { OpencodeRow } from './opencode-db'
import type { ProcessRow } from './process-table'
import { toolActivity, toolCategory } from './tool-category'

// `opencode <word>` runs that hold no conversation of their own: servers, a client of some
// other server, and one-shot commands.
const NOT_A_SESSION = new Set([
  'serve',
  'web',
  'acp',
  'attach',
  'upgrade',
  'uninstall',
  'auth',
  'providers',
  'agent',
  'mcp',
  'models',
  'stats',
  'export',
  'import',
  'github',
  'pr',
  'session',
  'db',
  'debug',
  'completion',
  'plugin',
  'generate'
])

// The compiled binary is the agent. A package runner's `node …/bin/opencode` only starts it.
export function opencodeProcesses(
  rows: ProcessRow[],
  platform: NodeJS.Platform = process.platform
): { pid: number; startedAtMs: number }[] {
  return rows
    .filter(
      ({ argv }) =>
        programName(argv[0]) === 'opencode' &&
        isAgentCli(argv[0], platform) &&
        !NOT_A_SESSION.has(argv[1] ?? '')
    )
    .map(({ pid, startedAtMs }) => ({ pid, startedAtMs }))
}

export function isOpencodeService({ argv }: ProcessRow): boolean {
  return programName(argv[0]) === 'opencode' && /^(serve|web|acp|attach)$/.test(argv[1] ?? '')
}

export interface OpencodeState {
  activity: AgentActivity
  attention: AgentAttention
  currentTool: CurrentTool | null
}
export const OPENCODE_IDLE: OpencodeState = {
  activity: 'idle',
  attention: 'none',
  currentTool: null
}
const THINKING: OpencodeState = { activity: 'thinking', attention: 'none', currentTool: null }
const CLOCK_SKEW_MS = 5000

// A reply that ended on tool calls is followed by the next step within moments. One that is not
// was stopped (a refused permission leaves exactly these rows), so it stops counting as work.
export const NEXT_STEP_MS = 60_000
const isRecent = (atMs: unknown, now: number): boolean =>
  typeof atMs === 'number' &&
  Number.isFinite(atMs) &&
  now >= atMs - CLOCK_SKEW_MS &&
  now - atMs < NEXT_STEP_MS

// `message` is the session's newest message and `parts` that message's parts, newest first, as
// the fixed statements return them. Whether a turn ended is the message's to say: a failed or
// interrupted turn leaves no closing part.
export function opencodeState(
  message: OpencodeRow | undefined,
  parts: OpencodeRow[],
  now: number
): OpencodeState {
  if (message?.role === 'idle') {
    const attention =
      message.outcome === 'succeeded' ? 'done' : message.outcome === 'failed' ? 'error' : 'none'
    return { ...OPENCODE_IDLE, attention }
  }
  if (message?.role === 'user') {
    return isRecent(message.time_created, now) ? THINKING : OPENCODE_IDLE
  }
  if (message?.role !== 'assistant') return OPENCODE_IDLE
  if (typeof message.error === 'string') {
    // The owner pressed stop: nothing to look at. OpenCode 2 names it by type, 1.x by name.
    const isAborted = message.error === 'MessageAbortedError' || message.error === 'aborted'
    const attention = isAborted ? 'none' : 'error'
    return { ...OPENCODE_IDLE, attention }
  }
  if (typeof message.completed === 'number') {
    if (message.finish !== 'tool-calls') return { ...OPENCODE_IDLE, attention: 'done' }
    return isRecent(message.completed, now) ? THINKING : OPENCODE_IDLE
  }
  for (const part of parts) {
    const isOpen = part.status === 'running' || part.status === 'pending'
    if (part.type !== 'tool' || !isOpen || !isLabel(part.tool)) continue
    // The question tool runs until the owner answers it.
    if (part.tool === 'question') return { ...OPENCODE_IDLE, attention: 'question' }
    const category = toolCategory(part.tool)
    return {
      activity: toolActivity(category),
      attention: 'none',
      currentTool: {
        name: part.tool,
        category,
        ...(typeof part.id === 'string' && { callId: part.id })
      }
    }
  }
  return THINKING
}
