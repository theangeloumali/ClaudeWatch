import type { SessionRef, SubagentRef } from '../shared/office/types'
import { displayName, folderName } from './io'
import { placementOf } from './project-root'
import type { RegistryEntry } from './registry'
import type { TranscriptState } from './transcript-tail'

const NO_TOOL: TranscriptState = { tool: null, error: false }
import { toolActivity } from './tool-category'

export function sessionFromRegistry(
  entry: RegistryEntry,
  transcript: TranscriptState,
  subagents: SubagentRef[],
  root: string,
  worktree: string | null,
  startedAtMs = Date.parse(`${entry.procStart} UTC`) || 0
): SessionRef {
  const waiting = entry.status === 'waiting'
  return {
    key: `claude:${entry.sessionId}`,
    provider: 'claude',
    sessionId: entry.sessionId,
    pid: entry.pid,
    name: displayName(entry.name) || folderName(entry.cwd),
    cwd: entry.cwd,
    ...placementOf({ root, worktree }),
    host: 'terminal',
    orcaPaneKey: null,
    activity:
      entry.status === 'idle'
        ? 'idle'
        : transcript.tool
          ? toolActivity(transcript.tool.category)
          : entry.status === 'busy'
            ? // Background subagents answer their Agent call at once: the lead is waiting on them.
              subagents.length > 0
              ? 'delegating'
              : 'thinking'
            : entry.status === 'shell'
              ? 'running'
              : 'idle',
    attention: waiting
      ? /permission|approval/i.test(entry.waitingFor)
        ? 'permission'
        : 'question'
      : entry.status !== 'idle' && transcript.error
        ? 'error'
        : 'none',
    currentTool: transcript.tool,
    subagents,
    startedAtMs,
    updatedAtMs: entry.updatedAtMs,
    usage: null
  }
}

// A teammate shown as a session of its own (its lead has exited): placed by its own folder,
// proven by its own process, named by its own name.
export function sessionFromTeammate(
  teammate: SubagentRef & { cwd: string; pid: number },
  root: string,
  worktree: string | null
): SessionRef {
  const startedAtMs = teammate.startedAtMs ?? 0
  const placed = sessionFromRegistry(
    {
      pid: teammate.pid,
      sessionId: teammate.id,
      cwd: teammate.cwd,
      name: teammate.name ?? teammate.type,
      status: 'busy',
      waitingFor: '',
      procStart: '',
      updatedAtMs: startedAtMs
    },
    NO_TOOL,
    [],
    root,
    worktree
  )
  return { ...placed, activity: teammate.activity, startedAtMs }
}
