import { parseAgentKey } from '../../../shared/office/agent-key'
import type {
  AccountRef,
  AgentObservation,
  AgentView,
  SessionRef,
  SourceHealth,
  SubagentRef
} from '../../../shared/office/types'
import type { FloorGeometry, OfficeFrame, RoomGeometry, ZoneGeometry } from '../scene-model'

// Stable stand-ins for names, given by first sight: "Company A", "Project A-1", "Session A-1.1".
export interface RoleBook {
  company(companyKey: string): string
  project(companyKey: string, projectKey: string): string
  session(session: Pick<SessionRef, 'key' | 'companyKey' | 'projectKey'>): string
  sessionByKey(sessionKey: string): string | undefined
  teammate(sessionKey: string, memberId: string): string
  // Account labels can be organisation names; the plan stays, being no one's name.
  account(accountKey: string): string
  // A Claude source is named for its config folder, which holds the user's home path.
  source(sourceId: string): string
  // A role never changes once given, so a masked list stays valid for its input's life.
  readonly maskedFloors: WeakMap<readonly FloorGeometry[], FloorGeometry[]>
  readonly maskedSessions: WeakMap<readonly SessionRef[], SessionRef[]>
  readonly maskedAgents: WeakMap<readonly AgentView[], AgentView[]>
  readonly maskedAccounts: WeakMap<readonly AccountRef[], AccountRef[]>
  readonly maskedSources: WeakMap<readonly SourceHealth[], SourceHealth[]>
}

const LETTERS = 26

// 0 → A, 25 → Z, 26 → AA: a spreadsheet's column letters.
function letterOf(index: number): string {
  const letter = String.fromCharCode(65 + (index % LETTERS))
  return index < LETTERS ? letter : `${letterOf(Math.floor(index / LETTERS) - 1)}${letter}`
}

// The next number in a counter keyed by `scope`, or the one `key` already holds.
function numberer(): (scope: string, key: string) => number {
  const given = new Map<string, number>()
  const counts = new Map<string, number>()
  return (scope, key) => {
    const id = `${scope}\n${key}`
    const known = given.get(id)
    if (known !== undefined) return known
    const next = (counts.get(scope) ?? 0) + 1
    counts.set(scope, next)
    given.set(id, next)
    return next
  }
}

export function createRoleBook(): RoleBook {
  const numberOf = numberer()
  const sessions = new Map<string, string>()
  const letter = (companyKey: string): string => letterOf(numberOf('', companyKey) - 1)
  const projectCode = (companyKey: string, projectKey: string): string =>
    `${letter(companyKey)}-${numberOf(companyKey, projectKey)}`
  return {
    company: (companyKey) => `Company ${letter(companyKey)}`,
    project: (companyKey, projectKey) => `Project ${projectCode(companyKey, projectKey)}`,
    session: ({ key, companyKey, projectKey }) => {
      const known = sessions.get(key)
      if (known) return known
      const code = projectCode(companyKey, projectKey)
      const role = `Session ${code}.${numberOf(`${companyKey}\n${projectKey}`, key)}`
      sessions.set(key, role)
      return role
    },
    sessionByKey: (sessionKey) => sessions.get(sessionKey),
    teammate: (sessionKey, memberId) => `Teammate ${numberOf(`teammate\n${sessionKey}`, memberId)}`,
    account: (accountKey) => `Account ${numberOf('account', accountKey)}`,
    source: (sourceId) => {
      const [family, ...folder] = sourceId.split(':')
      // The provider prefix stays: activity checks match a failing source by it.
      return folder.length
        ? `${family}:config ${numberOf(`source\n${family}`, sourceId)}`
        : sourceId
    },
    maskedFloors: new WeakMap(),
    maskedSessions: new WeakMap(),
    maskedAgents: new WeakMap(),
    maskedAccounts: new WeakMap(),
    maskedSources: new WeakMap()
  }
}

// Masks every name the HUD and the scene draw; keys stay, because stores match on them. Each list
// is masked once, so a frame that only moved agents keeps every other field (perf-2).
export function maskFrame(frame: OfficeFrame, roles: RoleBook): OfficeFrame {
  const sessions = remembered(roles.maskedSessions, frame.sessions, (list) =>
    list.map((session) => maskSession(session, roles))
  )
  const floors = remembered(roles.maskedFloors, frame.floors, (list) =>
    list.map((floor) => maskFloor(floor, roles))
  )
  const agents = remembered(roles.maskedAgents, frame.agents, (list) =>
    list.map((agent) => maskAgent(agent, frame, roles))
  )
  return {
    ...frame,
    sessions,
    floors,
    agents,
    sources: remembered(roles.maskedSources, frame.sources, (list) =>
      list.map((source) => maskSource(source, roles))
    ),
    ...(frame.accounts && {
      accounts: remembered(roles.maskedAccounts, frame.accounts, (list) =>
        list.map((account) => maskAccount(account, roles))
      )
    })
  }
}

// Floors built outside the feed, as the layout preview is; their sessions are named first.
export function maskFloors(
  floors: readonly FloorGeometry[],
  sessions: readonly SessionRef[],
  roles: RoleBook
): FloorGeometry[] {
  for (const session of sessions) roles.session(session)
  return remembered(roles.maskedFloors, floors, (list) =>
    list.map((floor) => maskFloor(floor, roles))
  )
}

// A saved room's stand-in, from its world target: `session:<key>` or `team:<company>:<project>`.
export function worldTargetRole(target: string, roles: RoleBook): string {
  const [kind, first, second] = target.split(':')
  if (kind === 'session') return roles.sessionByKey(target.slice('session:'.length)) ?? 'Office'
  return kind === 'team' && first && second ? `${roles.project(first, second)} team` : 'Team'
}

const maskAccount = (account: AccountRef, roles: RoleBook): AccountRef => ({
  ...account,
  label: roles.account(account.key)
})

function remembered<Input extends object, Output>(
  memo: WeakMap<Input, Output>,
  input: Input,
  mask: (input: Input) => Output
): Output {
  const known = memo.get(input)
  if (known) return known
  const masked = mask(input)
  memo.set(input, masked)
  return masked
}

function maskSession(session: SessionRef, roles: RoleBook): SessionRef {
  const company = roles.company(session.companyKey)
  const project = roles.project(session.companyKey, session.projectKey)
  const folder = `/${company}/${project}`
  return {
    ...session,
    name: roles.session(session),
    cwd: folder,
    projectRoot: folder,
    worktree: session.worktree === null ? null : folder,
    companyLabel: company,
    projectLabel: project,
    ...(session.observation && { observation: maskObservation(session.observation, roles) }),
    subagents: session.subagents.map((member) => maskMember(member, session.key, folder, roles))
  }
}

const maskObservation = (observation: AgentObservation, roles: RoleBook): AgentObservation => ({
  ...observation,
  sourceId: roles.source(observation.sourceId)
})

// A failure's detail can quote the folder it could not read; the health list words it instead.
function maskSource(source: SourceHealth, roles: RoleBook): SourceHealth {
  const id = roles.source(source.id)
  return id === source.id ? source : { ...source, id, detail: '' }
}

function maskMember(
  member: SubagentRef,
  sessionKey: string,
  folder: string,
  roles: RoleBook
): SubagentRef {
  return {
    ...member,
    ...(member.name !== undefined && { name: roles.teammate(sessionKey, member.id) }),
    ...(member.observation && { observation: maskObservation(member.observation, roles) }),
    ...(member.cwd !== undefined && { cwd: folder })
  }
}

function maskAgent(agent: AgentView, frame: OfficeFrame, roles: RoleBook): AgentView {
  const session = parseAgentKey(agent.agentKey, frame.sessions)?.session
  return { ...agent, label: session ? roles.session(session) : 'Agent' }
}

function maskFloor(floor: FloorGeometry, roles: RoleBook): FloorGeometry {
  const projects = floor.zones.flatMap(projectZones)
  const name =
    projects.length === 1 && projects[0].companyKey && projects[0].projectKey
      ? roles.project(projects[0].companyKey, projects[0].projectKey)
      : 'Headquarters'
  return withoutDisplayLabel({
    ...floor,
    label: floor.floorNumber ? `${name} · Floor ${floor.floorNumber}` : name,
    rooms: floor.rooms.map((room) => maskRoom(room, roles)),
    zones: floor.zones.map((zone) => maskZone(zone, roles))
  })
}

const projectZones = (zone: ZoneGeometry): ZoneGeometry[] =>
  zone.kind === 'project' ? [zone] : zone.children.flatMap(projectZones)

function maskZone(zone: ZoneGeometry, roles: RoleBook): ZoneGeometry {
  return withoutDisplayLabel({
    ...zone,
    label: zoneRole(zone, roles),
    children: zone.children.map((child) => maskZone(child, roles))
  })
}

function zoneRole(zone: ZoneGeometry, roles: RoleBook): string {
  const { companyKey, projectKey, sessionKey } = zone
  if (sessionKey) return roles.sessionByKey(sessionKey) ?? 'Office'
  if (!companyKey) return 'Company'
  if (zone.kind === 'company' || !projectKey) return roles.company(companyKey)
  const project = roles.project(companyKey, projectKey)
  return zone.kind === 'team' ? `${project} team` : project
}

// A team room names its project only through its world target, `team:<company>:<project>`.
function maskRoom(room: RoomGeometry, roles: RoleBook): RoomGeometry {
  const target = room.sessionKey ? `session:${room.sessionKey}` : (room.worldTarget ?? '')
  return withoutDisplayLabel({ ...room, label: worldTargetRole(target, roles) })
}

// The layout carries the saved city's own name beside the drawn label; it is dropped here.
function withoutDisplayLabel<Value extends object>(value: Value): Value {
  Reflect.deleteProperty(value, 'displayLabel')
  return value
}
