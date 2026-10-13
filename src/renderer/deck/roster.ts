import { needsHuman } from '../../shared/office/attention'
import { projectKey, projectRootOf } from '../../shared/office/project-key'
import { sumCounts } from '../../shared/office/token-counts'
import type {
  AgentActivity,
  AgentAttention,
  SessionRef,
  SubagentRef
} from '../../shared/office/types'
import { GEM_SPECS } from '../office/logic/status-gem'
import type { ClaudeInstance } from '../lib/types'
import { pathSegments, timeAgo } from '../lib/utils'
import { buildTokenLedger, sessionTokens } from './tokens'

// Listed in roster order: whoever needs you first, the departed last.
const AGENT_STATES = [
  'needs-you',
  'error',
  'limited',
  'working',
  'done',
  'idle',
  'stale',
  'exited'
] as const

export type AgentState = (typeof AGENT_STATES)[number]

export interface RosterAgent {
  pid: number
  instance: ClaudeInstance
  name: string
  state: AgentState
  // The reason, the running tool or how long ago it finished; null when the state says it all.
  stateDetail: string | null
  tokens: number | null
  isInOrca: boolean
}

export interface Squad {
  key: string
  name: string
  company: string
  crest: string
  agents: RosterAgent[]
  needsYouCount: number
  // Every session of the project in the feed, whatever runs it; null until one is counted.
  tokens: number | null
  isTokensPartial: boolean
}

export interface SquadTally {
  needsYou: number
  working: number
  resting: number
}

// A turn that ended this recently reads as "Done"; after that the agent is just idle.
const DONE_WINDOW_MS = 10 * 60 * 1000

// Two-letter crests for a name, best first: outer initials, then the first letter with each
// later word's initial, then with each later letter.
function crestCandidates(projectName: string): string[] {
  const words = projectName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
  if (words.length === 0) return ['?']
  const first = words[0][0]
  const laterInitials = words.slice(1).map((word) => word[0])
  const laterLetters = [...words.join('').slice(1)]
  const seconds = [...laterInitials.reverse(), ...laterLetters]
  const crests = seconds.map((second) => (first + second).toUpperCase())
  return crests.length > 0 ? [...new Set(crests)] : [first.toUpperCase()]
}

export function crestFor(projectName: string): string {
  return crestCandidates(projectName)[0]
}

// In name order, so a crest does not change when the roster reorders around who needs you.
function assignCrests(squads: readonly Squad[]): void {
  const taken = new Set<string>()
  for (const squad of [...squads].sort((a, b) => a.name.localeCompare(b.name))) {
    squad.crest = crestCandidates(squad.name).find((crest) => !taken.has(crest)) ?? squad.crest
    taken.add(squad.crest)
  }
}

// What the feed alone says about an agent, in the Deck's words; the Office shows exactly this.
export function stateOfAttention(
  attention: AgentAttention,
  activity: AgentActivity
): { state: AgentState; detail: string | null } {
  if (needsHuman(attention)) return { state: 'needs-you', detail: GEM_SPECS[attention].label }
  if (attention === 'none') return { state: activity === 'idle' ? 'idle' : 'working', detail: null }
  return { state: attention, detail: null }
}

// What the feed says of one process: a session, or a teammate (which reports no attention).
type FeedState = Pick<SessionRef, 'attention' | 'activity' | 'currentTool'>

function stateOf(
  instance: ClaudeInstance,
  session: FeedState | undefined,
  nowMs: number
): Pick<RosterAgent, 'state' | 'stateDetail'> {
  // A finished turn is timed from the process below, so only the other attention states decide.
  if (session && session.attention !== 'none' && session.attention !== 'done') {
    const { state, detail } = stateOfAttention(session.attention, session.activity)
    return { state, stateDetail: detail }
  }
  // The feed knows a tool is running even while it waits on a subprocess and burns no CPU.
  const isWorking = session ? session.activity !== 'idle' : instance.status === 'active'
  if (isWorking) return { state: 'working', stateDetail: session?.currentTool?.name ?? null }
  if (instance.status === 'stale' || instance.status === 'exited') {
    return { state: instance.status, stateDetail: null }
  }

  const idleSince = instance.lastBecameIdleAt ? new Date(instance.lastBecameIdleAt) : null
  if (idleSince && nowMs - idleSince.getTime() < DONE_WINDOW_MS) {
    return { state: 'done', stateDetail: timeAgo(idleSince) }
  }
  return { state: 'idle', stateDetail: null }
}

function emptySquad(instance: ClaudeInstance, session: SessionRef | undefined): Squad {
  const projectRoot = projectRootOf(instance.projectPath)
  const segments = pathSegments(projectRoot)
  const name = session?.projectLabel ?? segments[segments.length - 1] ?? instance.projectName
  return {
    // The feed keys a project by a hash of its root; hashing the path the same way keeps an
    // agent the feed has not picked up yet in its project's squad.
    key: session?.projectKey ?? projectKey(projectRoot),
    name,
    company: session?.companyLabel ?? segments[segments.length - 2] ?? '',
    crest: crestFor(name),
    agents: [],
    needsYouCount: 0,
    tokens: null,
    isTokensPartial: false
  }
}

function toAgent(
  instance: ClaudeInstance,
  session: SessionRef | undefined,
  nowMs: number
): RosterAgent {
  return {
    pid: instance.pid,
    instance,
    name: session?.name ?? `Session ${instance.pid}`,
    ...stateOf(instance, session, nowMs),
    tokens: sessionTokens(session?.usage),
    isInOrca: session?.host === 'orca'
  }
}

// A teammate is its own process, so the process list has it; the feed lists it under its lead.
function teammateAgent(instance: ClaudeInstance, member: SubagentRef, nowMs: number): RosterAgent {
  const feedState: FeedState = { attention: 'none', activity: member.activity, currentTool: null }
  return {
    pid: instance.pid,
    instance,
    name: member.name ?? member.type,
    ...stateOf(instance, feedState, nowMs),
    tokens: member.tokens ? sumCounts(member.tokens) : null,
    isInOrca: Boolean(member.orcaPaneKey)
  }
}

// `sessions` is null while the office feed is unavailable; rows then show process state only.
export function buildSquads(
  instances: readonly ClaudeInstance[],
  sessions: readonly SessionRef[] | null,
  nowMs: number
): Squad[] {
  const sessionByPid = new Map<number, SessionRef>()
  const teammateByPid = new Map<number, { lead: SessionRef; member: SubagentRef }>()
  for (const session of sessions ?? []) {
    if (session.pid !== null) sessionByPid.set(session.pid, session)
    for (const member of session.subagents) {
      if (member.kind === 'teammate' && typeof member.pid === 'number') {
        teammateByPid.set(member.pid, { lead: session, member })
      }
    }
  }

  const squadByKey = new Map<string, Squad>()
  for (const instance of instances) {
    const session = sessionByPid.get(instance.pid)
    const teammate = session ? undefined : teammateByPid.get(instance.pid)
    const candidate = emptySquad(instance, session ?? teammate?.lead)
    const squad = squadByKey.get(candidate.key) ?? candidate
    squadByKey.set(squad.key, squad)

    const agent = teammate
      ? teammateAgent(instance, teammate.member, nowMs)
      : toAgent(instance, session, nowMs)
    squad.agents.push(agent)
    if (agent.state === 'needs-you') squad.needsYouCount += 1
  }

  const squads = [...squadByKey.values()]
  assignCrests(squads)
  const ledger = sessions ? buildTokenLedger(sessions) : null
  for (const squad of squads) {
    squad.tokens = ledger?.projects.get(squad.key) ?? null
    squad.isTokensPartial =
      squad.tokens !== null &&
      (ledger?.partialProjects.has(squad.key) === true ||
        squad.agents.some((agent) => agent.tokens === null))
    squad.agents.sort(
      (a, b) =>
        AGENT_STATES.indexOf(a.state) - AGENT_STATES.indexOf(b.state) ||
        a.name.localeCompare(b.name) ||
        a.pid - b.pid
    )
  }
  return squads.sort((a, b) => b.needsYouCount - a.needsYouCount || a.name.localeCompare(b.name))
}

export function filterSquads(squads: readonly Squad[], query: string): Squad[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...squads]
  const matches = (text: string): boolean => text.toLowerCase().includes(needle)

  return squads.flatMap((squad) => {
    if (matches(squad.name) || matches(squad.company)) return [squad]
    const agents = squad.agents.filter(
      (agent) =>
        matches(agent.name) ||
        matches(agent.instance.projectPath) ||
        agent.instance.flags.some(matches)
    )
    return agents.length > 0 ? [{ ...squad, agents }] : []
  })
}

export function tallySquads(squads: readonly Squad[]): SquadTally {
  const tally: SquadTally = { needsYou: 0, working: 0, resting: 0 }
  for (const agent of squads.flatMap((squad) => squad.agents)) {
    if (agent.state === 'needs-you') tally.needsYou += 1
    else if (agent.state === 'working') tally.working += 1
    else tally.resting += 1
  }
  return tally
}
