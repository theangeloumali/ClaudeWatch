import type { SessionRef, SubagentRef } from '../../shared/office/types'
import { createAgent, type AgentRecord } from './behaviour'
import type { Point } from './path'

export function session(key: string, project = 'p_a'): SessionRef {
  return {
    key,
    projectKey: project,
    projectLabel: project,
    projectRoot: `/work/${project}`,
    companyKey: 'c_work',
    companyLabel: 'Work',
    provider: 'claude',
    sessionId: key,
    pid: null,
    name: key,
    cwd: '/project',
    worktree: null,
    host: 'terminal',
    orcaPaneKey: null,
    activity: 'idle',
    attention: 'none',
    currentTool: null,
    subagents: [],
    startedAtMs: 0,
    updatedAtMs: 0
  }
}

export function subagent(id: string, kind?: SubagentRef['kind']): SubagentRef {
  return { id, type: 'Explore', activity: 'thinking', ...(kind && { kind }) }
}

// An agent standing on the first point of `path`, about to walk it to `desk`.
export function walkingAgent(
  of: SessionRef,
  desk: Parameters<typeof createAgent>[1],
  path: Point[]
): AgentRecord {
  const agent = createAgent(of, desk, false)
  return { ...agent, view: { ...agent.view, ...path[0] }, path: path.map((p) => ({ ...p })) }
}
