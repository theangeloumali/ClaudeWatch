import type { ProviderId, SelectedModelRef, SessionRef } from '../../../shared/office/types'

const CLAUDE_FAMILIES = ['opus', 'sonnet', 'haiku'] as const

const titleCase = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1)
const isVersionPart = (part: string): boolean => /^\d{1,2}$/.test(part)

// Both id orders: `claude-opus-4-1-20250805` and the older `claude-3-5-sonnet-20241022`.
function claudeName(modelId: string): string | null {
  const parts = modelId.toLowerCase().split('-')
  if (parts[0] !== 'claude') return null
  const familyIndex = parts.findIndex((part) => CLAUDE_FAMILIES.some((family) => family === part))
  if (familyIndex < 0) return null
  const after = parts.slice(familyIndex + 1).filter(isVersionPart)
  const before = parts.slice(1, familyIndex).filter(isVersionPart)
  const version = (after.length > 0 ? after : before).join('.')
  return [titleCase(parts[familyIndex]), version].filter(Boolean).join(' ')
}

// The short name the Campus chips show; null when the session reports no model.
export function friendlyModelName(
  provider: ProviderId,
  model: SelectedModelRef | undefined
): string | null {
  if (provider === 'codex') return 'Codex'
  if (!model) return null
  return (provider === 'claude' && claudeName(model.modelId)) || model.modelId
}

export interface ModelChip {
  label: string
  count: number
}

export function runsOnChips(sessions: readonly SessionRef[]): ModelChip[] {
  const counts = new Map<string, number>()
  for (const session of sessions) {
    const label = friendlyModelName(session.provider, session.selectedModel)
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((first, second) => second.count - first.count || first.label.localeCompare(second.label))
}
