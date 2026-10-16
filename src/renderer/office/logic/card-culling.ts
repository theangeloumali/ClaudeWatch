import type { CardStatus } from './name-cards'

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface CullCandidate {
  agentKey: string
  projectKey: string | null
  status: CardStatus
  updatedAtMs: number
  isSelected: boolean
  rect: Rect
}

export interface CullOutcome {
  cards: Set<string>
  dots: Set<string>
  stackedProjects: Set<string>
  // Cards that fit but were turned into dots by the cap; shown as a count, never silently.
  capped: number
}

export interface CullOptions {
  stackProjects: boolean
  cap: number
}

const FLOOR_CULL: CullOptions = { stackProjects: true, cap: Number.POSITIVE_INFINITY }

// More than this many overlapping cards in one project collapse into a single stacked badge.
export const STACK_THRESHOLD = 3

// Lower wins. Limited sits with error: both are states the owner may need to act on.
const STATUS_RANK: Record<CardStatus, number> = {
  permission: 0,
  waiting: 1,
  error: 2,
  limited: 2,
  working: 3,
  done: 4,
  idle: 5
}

function byPriority(a: CullCandidate, b: CullCandidate): number {
  return (
    Number(b.isSelected) - Number(a.isSelected) ||
    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    b.updatedAtMs - a.updatedAtMs
  )
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

function inside(rect: Rect, area: Rect): boolean {
  return (
    rect.left >= area.left &&
    rect.right <= area.right &&
    rect.top >= area.top &&
    rect.bottom <= area.bottom
  )
}

// Greedy screen-space culling, highest priority first. A card that would overlap a kept card,
// sit under the HUD or pass the cap becomes a status dot over its robot, so no state is hidden.
export function cullCards(
  candidates: readonly CullCandidate[],
  safeArea: Rect,
  { stackProjects, cap }: CullOptions = FLOOR_CULL
): CullOutcome {
  const kept: CullCandidate[] = []
  const involved = new Set<string>()
  let capped = 0
  for (const card of [...candidates].sort(byPriority)) {
    if (card.isSelected) {
      kept.push(card)
      continue
    }
    if (!inside(card.rect, safeArea)) continue
    const blocker = kept.find((other) => overlaps(card.rect, other.rect))
    if (blocker) {
      involved.add(card.agentKey)
      involved.add(blocker.agentKey)
    } else if (kept.length >= cap) capped += 1
    else kept.push(card)
  }

  const involvedPerProject = new Map<string, number>()
  for (const card of stackProjects ? candidates : []) {
    if (!card.projectKey || !involved.has(card.agentKey)) continue
    involvedPerProject.set(card.projectKey, (involvedPerProject.get(card.projectKey) ?? 0) + 1)
  }
  const stackedProjects = new Set(
    [...involvedPerProject]
      .filter(([, count]) => count > STACK_THRESHOLD)
      .map(([projectKey]) => projectKey)
  )

  const cards = new Set(
    kept
      .filter(
        (card) => card.isSelected || !card.projectKey || !stackedProjects.has(card.projectKey)
      )
      .map((card) => card.agentKey)
  )
  const dots = new Set(
    candidates.filter((card) => !cards.has(card.agentKey)).map((card) => card.agentKey)
  )
  return { cards, dots, stackedProjects, capped }
}
