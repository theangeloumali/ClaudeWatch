// Contract between the bridge (truth), the office sim and the office renderer.
// Change it only together with every consumer; additions stay optional until all of them read it.

export type ProviderId = 'claude' | 'codex' | 'opencode'

// Selected configuration, not proof of which model is currently executing.
export interface SelectedModelRef {
  providerId: string
  modelId: string
  variant?: string
}

export type AgentActivity =
  | 'idle'
  | 'thinking'
  | 'reading'
  | 'editing'
  | 'running'
  | 'searching'
  | 'delegating'

// What the human owes this session, if anything. 'done' means the turn ended, not "needs you".
export type AgentAttention = 'none' | 'permission' | 'question' | 'done' | 'error' | 'limited'

export type ToolCategory = 'read' | 'edit' | 'run' | 'web' | 'agent' | 'other'

export type SessionHost = 'terminal' | 'orca' | 'vscode' | 'unknown'

export interface CurrentTool {
  name: string
  category: ToolCategory
  // Opaque per-call id, so two calls of one tool read as two; never drawn.
  callId?: string
}

export interface AgentObservation {
  sourceId: string
  observedAtMs: number
  staleAfterMs: number
  coverage: 'own' | 'unknown'
}

// Tokens counted from a transcript. Numbers only, never text.
export interface TokenCounts {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
}

// What a session has spent since it began: its own thread, and every agent it spawned
// (finished ones included, because they spent the tokens).
export interface SessionUsage {
  own: TokenCounts
  subagents: TokenCounts
  spawned: number
  contextTokens: number | null // tokens in the window at the latest turn
  contextLimit: number | null // known for Codex only
}

export interface SubagentRef {
  id: string
  type: string
  activity: AgentActivity
  selectedModel?: SelectedModelRef
  // A teammate is an agent-team member with its own process and pane; a subagent runs inside
  // its parent. Absent means subagent.
  kind?: 'subagent' | 'teammate'
  name?: string // the teammate's own name, e.g. "lena-b5-themes"
  // The teammate's own working folder, when its roster names one; else it works in its lead's.
  cwd?: string
  pid?: number | null
  startedAtMs?: number
  orcaPaneKey?: string | null
  tokens?: TokenCounts | null
  observation?: AgentObservation
  currentTool?: CurrentTool | null
  attention?: AgentAttention
}

export type AccountConfidence = 'exact' | 'inferred' | 'unattributed'

// An account as the Office may show it: a label and a plan, never an email or an id.
export interface AccountRef {
  key: string
  provider: ProviderId
  label: string
  plan: string | null // display words ("Max 20x"), not the provider's tier id
  isActive: boolean
}

export interface SessionRef {
  key: string // `${provider}:${sessionId}`
  provider: ProviderId
  selectedModel?: SelectedModelRef
  sessionId: string
  pid: number | null
  name: string // session name, else the cwd basename
  cwd: string
  projectKey: string
  projectLabel: string
  projectRoot: string // main repo root (worktrees resolve to it)
  // The company is the folder holding the project (e.g. ~/Work/ZKidz); it groups offices on the floor.
  companyKey: string
  companyLabel: string
  worktree: string | null
  host: SessionHost
  orcaPaneKey: string | null
  activity: AgentActivity
  attention: AgentAttention
  currentTool: CurrentTool | null
  subagents: SubagentRef[]
  startedAtMs: number
  // When the conversation began, where it can outlive its process: a resumed Codex thread
  // runs in a new process and carries its whole history in its usage.
  threadStartedAtMs?: number
  updatedAtMs: number
  // null: not counted yet, or unreadable.
  usage?: SessionUsage | null
  accountKey?: string | null
  accountConfidence?: AccountConfidence
  observation?: AgentObservation
}

export interface SourceHealth {
  id: string
  ok: boolean
  detail: string
  // The last successful source check, not the latest poll of its cached result.
  checkedAtMs?: number
  staleAfterMs?: number
}

// Today's tokens for one project, from the accounts ledger. Numbers only.
export interface ProjectTokens {
  projectKey: string
  tokens: number
}

export interface OfficeSnapshot {
  rev: number
  generatedAtMs: number
  sessions: SessionRef[]
  sources: SourceHealth[]
  accounts?: AccountRef[]
  projectsToday?: ProjectTokens[]
}

export type FeedMessage =
  | { type: 'hello'; v: 1; snapshot: OfficeSnapshot }
  | {
      type: 'patch'
      v: 1
      seq: number
      upserts: SessionRef[]
      removed: string[]
      // Present only when a source's health changed.
      sources?: SourceHealth[]
      // Present only when a project's total for today changed.
      projectsToday?: ProjectTokens[]
    }
  | { type: 'resync' }

// What the renderer draws for one agent; produced by the sim, never by raw events.
export interface AgentView {
  elevation?: number
  physicalFloorId?: string | null
  agentKey: string
  floorId: string
  roomId: string
  slotId: string
  x: number
  z: number
  heading: number
  activity: AgentActivity
  attention: AgentAttention
  provider: ProviderId
  isSubagent: boolean
  label: string
  // Absent means the agent is at its own desk; 'leaving' while it walks out or fades (seating-5).
  place?: 'lounge' | 'leaving'
  // How far a departing agent has faded out where it stands, 0–1; absent while fully here.
  fade?: number
}

// How long a departing agent takes to fade out where it stands.
export const DEPARTURE_FADE_MS = 500
// The sim's step. Its last faded view comes one step before the fade's end, when it reseats.
export const SIM_TICK_MS = 100

// Why an office interaction did not happen; the UI turns each into plain words.
export const INTERACTION_FAILURES = [
  'unknown-session',
  'not-in-orca',
  'orca-unavailable',
  'terminal-not-found',
  'no-permission-prompt',
  // Talk refused: a dialog is on the agent's screen, and typed text would answer it.
  'prompt-on-screen',
  'prompt-changed',
  'unsupported-provider',
  'invalid-input',
  'not-permitted',
  // Start refused: the agent is not on PATH, and nothing in the project folder is run instead.
  'agent-not-found'
] as const

export type InteractionFailure = (typeof INTERACTION_FAILURES)[number]

export interface InteractionResult {
  success: boolean
  reason?: InteractionFailure
}

export interface PeekResult extends InteractionResult {
  lines: string[]
  // Identifies exactly what was shown; respond() refuses if the screen no longer matches it.
  fingerprint?: string
  capturedAtMs?: number
  targetAgentKey?: string
  terminal?: TerminalProvenance
}

export interface TerminalProvenance {
  ownerAgentKey: string
  paneKey: string
  pid: number
  startedAtMs: number
  incarnationId: string
}

// Where a focus request landed: the agent's exact pane, only the Orca app (the pane could not
// be proven to be the agent's), a terminal opened at the session's folder, or only the
// terminal app brought forward (a view-only page, which may type nothing).
export const FOCUS_TARGETS = ['pane', 'app', 'terminal', 'terminal-app'] as const

export interface FocusResult extends InteractionResult {
  target?: (typeof FOCUS_TARGETS)[number]
}

export type PermissionDecision = 'approve' | 'deny'
