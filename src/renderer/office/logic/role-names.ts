import { parseAgentKey } from '../../../shared/office/agent-key'
import type { AgentView, SessionRef } from '../../../shared/office/types'
import type { FloorGeometry, OfficeFrame, RoomGeometry, ZoneGeometry } from '../scene-model'

// Stable stand-ins for names, given by first sight: "Company A", "Project A-1", "Session A-1.1".
export interface RoleBook {
  company(companyKey: string): string
  project(companyKey: string, projectKey: string): string
  session(session: Pick<SessionRef, 'key' | 'companyKey' | 'projectKey'>): string
  sessionByKey(sessionKey: string): string | undefined
  // A role never changes once given, so a masked list stays valid for its input's life.
  readonly maskedFloors: WeakMap<readonly FloorGeometry[], FloorGeometry[]>
  readonly maskedSessions: WeakMap<readonly SessionRef[], SessionRef[]>
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
    maskedFloors: new WeakMap(),
    maskedSessions: new WeakMap()
  }
}

// Masks every name the HUD and the scene draw; keys stay, because stores match on them.
export function maskFrame(frame: OfficeFrame, roles: RoleBook): OfficeFrame {
  const sessions = remembered(roles.maskedSessions, frame.sessions, (list) =>
    list.map((session) => maskSession(session, roles))
  )
  const floors = remembered(roles.maskedFloors, frame.floors, (list) =>
    list.map((floor) => maskFloor(floor, roles))
  )
  return {
    ...frame,
    sessions,
    floors,
    agents: frame.agents.map((agent) => maskAgent(agent, frame, roles))
  }
}

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
    subagents: session.subagents.map((member) =>
      member.cwd === undefined ? member : { ...member, cwd: folder }
    )
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
  if (room.sessionKey)
    return withoutDisplayLabel({ ...room, label: roles.sessionByKey(room.sessionKey) ?? 'Office' })
  const [kind, companyKey, projectKey] = room.worldTarget?.split(':') ?? []
  const label =
    kind === 'team' && companyKey && projectKey
      ? `${roles.project(companyKey, projectKey)} team`
      : 'Team'
  return withoutDisplayLabel({ ...room, label })
}

// The layout carries the saved city's own name beside the drawn label; it is dropped here.
function withoutDisplayLabel<Value extends object>(value: Value): Value {
  Reflect.deleteProperty(value, 'displayLabel')
  return value
}
