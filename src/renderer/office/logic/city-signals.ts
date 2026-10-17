import { dayKey } from '../../../shared/day-key'
import { agentKey } from '../../../shared/office/agent-key'
import { observeAgent } from '../../../shared/office/observation'
import type {
  AgentAttention,
  ProjectTokens,
  SessionRef,
  ToolCategory
} from '../../../shared/office/types'
import { worldBuildingId } from '../../../shared/office/world-document-layout'
import { type AgentState, stateOfAttention } from '../../deck/roster'
import { sessionTokens } from '../../deck/tokens'
import type { OfficeFrame, ZoneGeometry } from '../scene-model'
import { isAgentActivityAvailable } from './activity-summary'
import { stageFor } from './token-spires'

// The one place live evidence becomes city facts. Keys and numbers only, never labels.
export type BuildingId = string

export interface BuildingSignal {
  tokensToday: number | null
  spireStage: number
  needsYou: boolean
  // What the human owes it; a permission stops the work outright, so it wins over a question.
  asks: 'permission' | 'question' | null
  hasError: boolean
  isLimited: boolean
  isDone: boolean
  busiestCategory: ToolCategory | null
  hasEvidence: boolean
}

export interface LeaderRow {
  key: string
  value: number
}

export interface Leaders {
  crowned: readonly string[] // lead agent keys, the top three by tokens
  topSpender: LeaderRow | null
  busiestProject: LeaderRow | null // keyed by building
  longestRunning: LeaderRow | null
  mostCrew: LeaderRow | null
}

export interface CompanyCounts {
  working: number
  waiting: number
  errors: number
  tokensToday: number | null
}

export interface CitySignals {
  buildings: ReadonlyMap<BuildingId, BuildingSignal>
  leaders: Leaders
  companies: ReadonlyMap<string, CompanyCounts>
}

// Each project's highest counted total seen today, for hosts with no accounts ledger, and each
// session's total when today began for it: what it spent before then is not today's.
export interface DayLedger {
  dayKey: string
  highest: ReadonlyMap<string, number>
  sessionBase: ReadonlyMap<string, number>
}

const CROWNS = 3

export const buildingIdOf = (companyKey: string, projectKey: string): BuildingId =>
  worldBuildingId(companyKey, projectKey)

export const createDayLedger = (day: string): DayLedger => ({
  dayKey: day,
  highest: new Map(),
  sessionBase: new Map()
})

// A session started today spent all of its tokens today; an older one, only what came after
// it was first seen today.
function spentToday(day: DayLedger, session: SessionRef): number | null {
  const tokens = sessionTokens(session.usage)
  if (tokens === null) return null
  return Math.max(0, tokens - (day.sessionBase.get(session.key) ?? 0))
}

// Grow-only within the local day, so a session ending never lowers a spire.
export function observeDay(
  day: DayLedger,
  sessions: readonly SessionRef[],
  nowMs: number
): DayLedger {
  const today = dayKey(nowMs)
  const isNewDay = day.dayKey !== today
  const highest = new Map(isNewDay ? [] : day.highest)
  const sessionBase = new Map(isNewDay ? [] : day.sessionBase)
  let hasChanged = isNewDay
  for (const session of sessions) {
    const tokens = sessionTokens(session.usage)
    if (tokens === null || sessionBase.has(session.key)) continue
    sessionBase.set(session.key, dayKey(session.startedAtMs) === today ? 0 : tokens)
    hasChanged = true
  }
  const next = { dayKey: today, highest, sessionBase }
  for (const [projectKey, tokens] of countedProjects(next, sessions)) {
    if (tokens <= (highest.get(projectKey) ?? -1)) continue
    highest.set(projectKey, tokens)
    hasChanged = true
  }
  return hasChanged ? next : day
}

// The page keeps one day, so a hoist and its spire count the same tokens (one ledger, two readers).
export interface DayLedgerStore {
  observe(sessions: readonly SessionRef[], nowMs: number): DayLedger
}

export function createDayLedgerStore(): DayLedgerStore {
  let day: DayLedger | null = null
  return {
    observe(sessions, nowMs) {
      day = observeDay(day ?? createDayLedger(dayKey(nowMs)), sessions, nowMs)
      return day
    }
  }
}

export function citySignals(frame: OfficeFrame, day: DayLedger, nowMs: number): CitySignals {
  const agents = freshAgents(frame, nowMs)
  const buildings = new Map<BuildingId, BuildingSignal>()
  const companies = new Map<string, CompanyCounts>()
  for (const [buildingId, place] of knownBuildings(frame)) {
    const signal = buildingSignal(
      agents.filter((agent) => agent.buildingId === buildingId),
      projectTokensToday({ projectsToday: frame.projectsToday, day, nowMs }, place.projectKey)
    )
    buildings.set(buildingId, signal)
    companies.set(place.companyKey, addCompany(companies.get(place.companyKey), signal))
  }
  for (const agent of agents) {
    const counts = companies.get(agent.companyKey)
    if (counts) companies.set(agent.companyKey, countAgent(counts, agent.state))
  }
  return { buildings, leaders: leadersOf(agents, day, nowMs), companies }
}

interface FreshAgent {
  agentKey: string
  session: SessionRef
  buildingId: BuildingId
  companyKey: string
  state: AgentState
  attention: AgentAttention
  category: ToolCategory | null
}

// Every lead and member whose own record is fresh; the rest set no state at all.
function freshAgents(frame: OfficeFrame, nowMs: number): FreshAgent[] {
  return frame.sessions.flatMap((session) => {
    const keys = [
      session.key,
      ...session.subagents.map((member) => agentKey(session.key, member.id))
    ]
    return keys.flatMap((key) => {
      if (!isAgentActivityAvailable(frame, { agentKey: key, provider: session.provider }, nowMs))
        return []
      const evidence = observeAgent({ ...frame, agentKey: key, nowMs })
      const { state } = stateOfAttention(evidence.attention ?? 'none', evidence.activity ?? 'idle')
      return [
        {
          agentKey: key,
          session,
          buildingId: buildingIdOf(session.companyKey, session.projectKey),
          companyKey: session.companyKey,
          state,
          attention: evidence.attention ?? 'none',
          category: evidence.currentTool?.category ?? null
        }
      ]
    })
  })
}

interface Place {
  companyKey: string
  projectKey: string
}

// Buildings with a session now, and those the city keeps whose sessions have ended.
function knownBuildings(frame: OfficeFrame): Map<BuildingId, Place> {
  const places = new Map<BuildingId, Place>()
  const add = (companyKey: string, projectKey: string): void => {
    places.set(buildingIdOf(companyKey, projectKey), { companyKey, projectKey })
  }
  const visit = (zone: ZoneGeometry): void => {
    if (zone.kind === 'project' && zone.companyKey && zone.projectKey)
      add(zone.companyKey, zone.projectKey)
    zone.children.forEach(visit)
  }
  for (const session of frame.sessions) add(session.companyKey, session.projectKey)
  for (const floor of frame.floors) floor.zones.forEach(visit)
  return places
}

function countedProjects(day: DayLedger, sessions: readonly SessionRef[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const session of sessions) {
    const tokens = spentToday(day, session)
    if (tokens !== null)
      totals.set(session.projectKey, (totals.get(session.projectKey) ?? 0) + tokens)
  }
  return totals
}

// The accounts ledger's day where the host keeps one; null is unknown, never 0.
export function projectTokensToday(
  today: { projectsToday: readonly ProjectTokens[] | undefined; day: DayLedger; nowMs: number },
  projectKey: string
): number | null {
  if (today.projectsToday)
    return today.projectsToday.find((entry) => entry.projectKey === projectKey)?.tokens ?? null
  const isToday = today.day.dayKey === dayKey(today.nowMs)
  return isToday ? (today.day.highest.get(projectKey) ?? null) : null
}

function buildingSignal(agents: readonly FreshAgent[], tokensToday: number | null): BuildingSignal {
  const has = (state: AgentState): boolean => agents.some((agent) => agent.state === state)
  return {
    tokensToday,
    spireStage: stageFor(tokensToday),
    needsYou: has('needs-you'),
    asks: agents.some((agent) => agent.attention === 'permission')
      ? 'permission'
      : agents.some((agent) => agent.attention === 'question')
        ? 'question'
        : null,
    hasError: has('error'),
    isLimited: has('limited'),
    isDone: has('done'),
    busiestCategory: busiestCategory(agents),
    hasEvidence: agents.length > 0
  }
}

function busiestCategory(agents: readonly FreshAgent[]): ToolCategory | null {
  const counts = new Map<ToolCategory, number>()
  for (const { state, category } of agents)
    if (state === 'working' && category) counts.set(category, (counts.get(category) ?? 0) + 1)
  return leaderOf([...counts].map(([key, value]) => ({ key, value })))?.key ?? null
}

function addCompany(counts: CompanyCounts | undefined, signal: BuildingSignal): CompanyCounts {
  const base = counts ?? { working: 0, waiting: 0, errors: 0, tokensToday: null }
  if (signal.tokensToday === null) return base
  return { ...base, tokensToday: (base.tokensToday ?? 0) + signal.tokensToday }
}

function countAgent(counts: CompanyCounts, state: AgentState): CompanyCounts {
  if (state === 'working') return { ...counts, working: counts.working + 1 }
  if (state === 'needs-you') return { ...counts, waiting: counts.waiting + 1 }
  if (state === 'error' || state === 'limited') return { ...counts, errors: counts.errors + 1 }
  return counts
}

function leadersOf(agents: readonly FreshAgent[], day: DayLedger, nowMs: number): Leaders {
  const leads = agents.filter((agent) => agent.agentKey === agent.session.key)
  const row = (value: (session: SessionRef) => number) =>
    leads.map((lead) => ({ key: lead.session.key, value: value(lead.session) }))
  const spenders = ranked(row((session) => spentToday(day, session) ?? 0))
  const working = new Map<string, number>()
  for (const agent of agents)
    if (agent.state === 'working')
      working.set(agent.buildingId, (working.get(agent.buildingId) ?? 0) + 1)
  return {
    crowned: spenders.slice(0, CROWNS).map((leader) => leader.key),
    topSpender: spenders[0] ?? null,
    busiestProject: leaderOf([...working].map(([key, value]) => ({ key, value }))),
    longestRunning: leaderOf(
      row((session) => nowMs - (session.threadStartedAtMs ?? session.startedAtMs))
    ),
    mostCrew: leaderOf(row((session) => session.subagents.length))
  }
}

// Code-unit order, as `<` gives it: unlike localeCompare it is the same on every machine.
export const compareKeys = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

// Largest first, ties to the smaller key whatever the roster order; a zero never leads.
function ranked<Key extends string>(
  rows: readonly { key: Key; value: number }[]
): { key: Key; value: number }[] {
  return rows
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value || compareKeys(a.key, b.key))
}

const leaderOf = <Key extends string>(
  rows: readonly { key: Key; value: number }[]
): { key: Key; value: number } | null => ranked(rows)[0] ?? null
