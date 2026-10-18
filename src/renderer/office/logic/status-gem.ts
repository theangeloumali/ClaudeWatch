import type { AgentView } from '../../../shared/office/types'
import { STATE_COLOR } from '../office-palette'

export type GemKind = keyof typeof STATE_COLOR

export interface GemSpec {
  kind: GemKind
  label: string
  color: string
}

// Every state has words plus an icon in the HUD, so colour is never the only cue.
export const GEM_SPECS: Record<GemKind, GemSpec> = {
  permission: { kind: 'permission', label: 'Needs permission', color: STATE_COLOR.permission },
  question: { kind: 'question', label: 'Waiting for you', color: STATE_COLOR.question },
  done: { kind: 'done', label: 'Done', color: STATE_COLOR.done },
  error: { kind: 'error', label: 'Error', color: STATE_COLOR.error },
  limited: { kind: 'limited', label: 'Rate limited', color: STATE_COLOR.limited },
  working: { kind: 'working', label: 'Working', color: STATE_COLOR.working }
}

export function gemFor(agent: Pick<AgentView, 'attention' | 'activity'>): GemSpec | null {
  if (agent.attention !== 'none') return GEM_SPECS[agent.attention]
  return agent.activity === 'idle' ? null : GEM_SPECS.working
}
