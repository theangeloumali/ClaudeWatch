import type { AgentView, SessionRef } from '../../types'

export function makeSession(overrides: Partial<SessionRef> & Pick<SessionRef, 'key'>): SessionRef {
  return {
    provider: 'claude',
    sessionId: overrides.key,
    pid: null,
    name: 'Example',
    cwd: '/example',
    projectKey: 'project',
    projectLabel: 'Project',
    projectRoot: '/example',
    companyKey: 'company',
    companyLabel: 'Company',
    worktree: null,
    host: 'terminal',
    orcaPaneKey: null,
    activity: 'idle',
    attention: 'none',
    currentTool: null,
    subagents: [],
    startedAtMs: 0,
    updatedAtMs: 0,
    ...overrides
  }
}

export function makeAgent(overrides: Partial<AgentView>): AgentView {
  return {
    agentKey: 'claude:example',
    floorId: 'f1',
    roomId: 'r1',
    slotId: 'desk_main',
    x: 0,
    z: 0,
    heading: 0,
    activity: 'idle',
    attention: 'none',
    provider: 'claude',
    isSubagent: false,
    label: 'Example',
    ...overrides
  }
}

export function makeRoom(room: { id: string; sessionKey: string }) {
  return room
}

export function makeFloor(floor: {
  floorId: string
  rooms?: readonly { sessionKey: string | null }[]
}) {
  return { label: floor.floorId, rooms: [], ...floor }
}
