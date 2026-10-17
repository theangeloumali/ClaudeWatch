import type {
  AgentActivity,
  AgentAttention,
  CurrentTool,
  ProviderId,
  SessionHost
} from '../../../shared/office/types'

export interface FixtureSession {
  name: string
  provider: ProviderId
  // Orca-hosted sessions let the preview exercise talk, peek and review.
  host?: SessionHost
  // Script indexes advance one step every `period` ticks, offset by `offset`.
  period: number
  offset: number
  attentionScript?: readonly AgentAttention[]
  subagentScript?: readonly number[]
  // Agent-team members: each has a name, a process and a pane of its own.
  teammates?: readonly { name: string; type: string }[]
  // Arrives with `usage: null`, the way a session does before its transcript is read.
  isUncounted?: boolean
}

export interface FixtureProject {
  label: string
  root: string
  sessions: readonly FixtureSession[]
}

export const ACTIVITY_SCRIPT: readonly AgentActivity[] = [
  'editing',
  'reading',
  'running',
  'thinking',
  'editing',
  'searching',
  'idle',
  'delegating'
]

export const TOOL_FOR_ACTIVITY: Record<AgentActivity, CurrentTool | null> = {
  idle: null,
  thinking: null,
  reading: { name: 'Read', category: 'read' },
  editing: { name: 'Edit', category: 'edit' },
  running: { name: 'Bash', category: 'run' },
  searching: { name: 'Grep', category: 'read' },
  delegating: { name: 'Task', category: 'agent' }
}

export const SUBAGENT_TYPES = ['Explore', 'code-reviewer', 'test-runner', 'Plan'] as const

export const PROJECTS: readonly FixtureProject[] = [
  {
    label: 'Customer portal',
    root: '/Users/dev/PropApp/customer-portal',
    sessions: [{ name: 'portal UI', provider: 'codex', period: 3, offset: 1 }]
  },
  {
    label: 'ClaudeWatch',
    root: '/Users/dev/ZKidz/ClaudeWatch',
    sessions: [
      {
        name: 'office renderer',
        provider: 'claude',
        host: 'orca',
        period: 3,
        offset: 0,
        subagentScript: [2, 1, 1, 0],
        teammates: [
          { name: 'lena-office-hud', type: 'lena' },
          { name: 'ravi-bridge-usage', type: 'ravi' }
        ]
      },
      { name: 'bridge reducer', provider: 'codex', period: 4, offset: 2 },
      {
        name: 'statusline tee',
        provider: 'claude',
        period: 2,
        offset: 5,
        attentionScript: ['none', 'none', 'question', 'question', 'none', 'done']
      },
      {
        name: 'electron upgrade',
        provider: 'claude',
        period: 5,
        offset: 1,
        attentionScript: ['none', 'error', 'error', 'none']
      },
      {
        name: 'widget sync',
        provider: 'codex',
        host: 'orca',
        // Done from 10 s to 100 s: time to walk to the game corner, play and be called back.
        period: 15,
        offset: 10,
        attentionScript: ['none', 'done', 'done', 'done', 'none']
      }
    ]
  },
  {
    label: 'PropApp',
    root: '/Users/dev/PropApp/propapp-v2',
    sessions: [
      {
        name: 'listing search',
        provider: 'claude',
        host: 'orca',
        period: 3,
        offset: 1,
        attentionScript: ['permission', 'permission', 'permission', 'none', 'none']
      },
      {
        name: 'stripe webhooks',
        provider: 'claude',
        period: 4,
        offset: 3,
        subagentScript: [1, 1, 2, 0]
      },
      { name: 'map clustering', provider: 'codex', period: 2, offset: 0, isUncounted: true },
      {
        name: 'agent dashboard',
        provider: 'claude',
        period: 5,
        offset: 6,
        attentionScript: ['none', 'limited', 'limited']
      },
      { name: 'image pipeline', provider: 'claude', period: 3, offset: 2 },
      {
        name: 'e2e suite',
        provider: 'codex',
        // Already done when the preview opens: it goes to the game corner first, and works again
        // from 90 s to 150 s.
        period: 15,
        offset: 0,
        attentionScript: ['done', 'done', 'done', 'none', 'none']
      },
      {
        name: 'auth migration',
        provider: 'claude',
        host: 'orca',
        period: 2,
        offset: 5,
        attentionScript: ['none', 'none', 'none', 'permission']
      },
      { name: 'i18n strings', provider: 'claude', period: 6, offset: 3 }
    ]
  },
  {
    label: 'zkidz-claude-team',
    root: '/Users/dev/ZKidz/zkidz-claude-team',
    sessions: [
      { name: 'skill gates', provider: 'claude', period: 3, offset: 2, subagentScript: [0, 1, 1] },
      {
        name: 'installer',
        provider: 'codex',
        period: 4,
        offset: 1,
        attentionScript: ['question', 'none', 'none']
      },
      { name: 'release notes', provider: 'opencode', period: 4, offset: 3 }
    ]
  }
]
