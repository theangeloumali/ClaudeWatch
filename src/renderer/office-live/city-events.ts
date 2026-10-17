import { observeSession } from '../../shared/office/observation'
import type {
  AgentAttention,
  FeedMessage,
  ProjectTokens,
  SessionRef,
  ToolCategory
} from '../../shared/office/types'
import { sessionTokens } from '../deck/tokens'
import {
  type BuildingId,
  buildingIdOf,
  createDayLedger,
  type DayLedger,
  observeDay,
  projectTokensToday
} from '../office/logic/city-signals'
import { milestoneStep, stageFor } from '../office/logic/token-spires'

export type CityEventKind = 'milestone' | 'hoist' | 'dispatch' | 'done'

export interface CityEvent {
  id: string
  kind: CityEventKind
  buildingId: BuildingId
  sessionKey: string
  category?: ToolCategory
  atMs: number
}

export interface CityEventLog {
  // `projectsToday` is the feed's day totals; without them the sessions' counts stand in.
  observe(
    type: FeedMessage['type'],
    sessions: readonly SessionRef[],
    atMs: number,
    projectsToday?: readonly ProjectTokens[]
  ): void
  active(nowMs?: number): readonly CityEvent[]
  // Counts fired events, so a frame loop can tell when a new one landed.
  version(): number
}

// How long each event stays live on the render clock; nothing is replayed after it.
export const CITY_EVENT_LIFE_MS: Record<CityEventKind, number> = {
  milestone: 2_500,
  hoist: 3_000,
  dispatch: 1_000,
  done: 900
}
const FIRED_MEMORY_MS = 10 * 60_000
// A crossing on a sliver of the day's spend is no construction (ClearSpent c1fcb124).
const HOIST_MIN_SHARE = 0.005

interface SessionSeen {
  attention: AgentAttention
  callId: string | undefined
  tokens: number | null
}

const seenOf = (session: SessionRef): SessionSeen => ({
  attention: session.attention,
  callId: session.currentTool?.callId,
  tokens: sessionTokens(session.usage)
})

const isFresh = (session: SessionRef, atMs: number): boolean =>
  observeSession({ session, sources: [], connected: true, nowMs: atMs }).status === 'fresh'

const buildingOf = (session: SessionRef): BuildingId =>
  buildingIdOf(session.companyKey, session.projectKey)

// A hello is a baseline, never an edge: only a patch between two known states fires.
export function createCityEventLog(): CityEventLog {
  let seen = new Map<string, SessionSeen>()
  let totals = new Map<BuildingId, number>()
  let day: DayLedger = createDayLedger('')
  const fired = new Map<string, number>()
  let live: CityEvent[] = []
  let firedCount = 0

  const fire = (event: CityEvent): void => {
    if (fired.has(event.id)) return
    fired.set(event.id, event.atMs)
    live = [...live, event]
    firedCount += 1
  }
  const forget = (nowMs: number): void => {
    for (const [id, atMs] of fired) if (nowMs - atMs >= FIRED_MEMORY_MS) fired.delete(id)
  }
  const sessionEdges = (session: SessionRef, atMs: number): void => {
    const previous = seen.get(session.key)
    if (!previous || !isFresh(session, atMs)) return
    const base = { buildingId: buildingOf(session), sessionKey: session.key, atMs }
    const now = seenOf(session)
    if (now.attention === 'done' && previous.attention !== 'done')
      fire({ ...base, id: `${session.key}:done:${session.updatedAtMs}`, kind: 'done' })
    if (now.callId !== undefined && now.callId !== previous.callId && session.currentTool)
      fire({
        ...base,
        id: `${session.key}:dispatch:${now.callId}`,
        kind: 'dispatch',
        category: session.currentTool.category
      })
    const step = milestoneStep(now.tokens)
    if (previous.tokens !== null && step > milestoneStep(previous.tokens))
      fire({ ...base, id: `${session.key}:milestone:${step}`, kind: 'milestone' })
  }
  const hoists = (
    sessions: readonly SessionRef[],
    next: ReadonlyMap<BuildingId, number>,
    atMs: number
  ): void => {
    for (const [buildingId, tokens] of next) {
      const previous = totals.get(buildingId)
      if (previous === undefined || stageFor(tokens) <= stageFor(previous)) continue
      if (tokens - previous < HOIST_MIN_SHARE * tokens) continue
      const crew = leadCrew(sessions, buildingId, atMs)
      if (crew)
        fire({
          id: `${buildingId}:hoist:${stageFor(tokens)}:${day.dayKey}`,
          kind: 'hoist',
          buildingId,
          sessionKey: crew,
          atMs
        })
    }
  }

  return {
    observe(type, sessions, atMs, projectsToday) {
      forget(atMs)
      if (type === 'resync') {
        seen = new Map()
        totals = new Map()
        return
      }
      day = observeDay(day, sessions, atMs)
      const next = buildingTotals(sessions, { projectsToday, day, nowMs: atMs })
      if (type === 'patch') {
        for (const session of sessions) sessionEdges(session, atMs)
        hoists(sessions, next, atMs)
      }
      seen = new Map(sessions.map((session) => [session.key, seenOf(session)]))
      totals = next
    },
    // Read every drawn frame: it allocates only when an event has just ended. Wall time by
    // default: under reduced motion the city clock stands still, and nothing would ever end.
    active(nowMs = Date.now()) {
      const isLive = (event: CityEvent): boolean =>
        nowMs - event.atMs < CITY_EVENT_LIFE_MS[event.kind]
      if (!live.every(isLive)) live = live.filter(isLive)
      return live
    },
    version: () => firedCount
  }
}

function buildingTotals(
  sessions: readonly SessionRef[],
  today: Parameters<typeof projectTokensToday>[0]
): Map<BuildingId, number> {
  const next = new Map<BuildingId, number>()
  for (const session of sessions) {
    const tokens = projectTokensToday(today, session.projectKey)
    if (tokens !== null) next.set(buildingOf(session), tokens)
  }
  return next
}

// The fresh session that spent most in the building; ties go to the smaller key.
function leadCrew(
  sessions: readonly SessionRef[],
  buildingId: BuildingId,
  atMs: number
): string | null {
  let best: { key: string; tokens: number } | null = null
  for (const session of sessions) {
    if (buildingOf(session) !== buildingId || !isFresh(session, atMs)) continue
    const tokens = sessionTokens(session.usage) ?? 0
    if (!best || tokens > best.tokens || (tokens === best.tokens && session.key < best.key))
      best = { key: session.key, tokens }
  }
  return best?.key ?? null
}

// The page's log: a module store like `officePoses`, fed once per feed message.
export const cityEvents = createCityEventLog()
