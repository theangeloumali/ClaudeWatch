import type { AgentView, SessionRef } from '../../../shared/office/types'
import type { FloorGeometry, OfficeFrame, ZoneGeometry } from '../scene-model'
import { needsHuman } from '../../../shared/office/attention'
import { observeAgent } from '../../../shared/office/observation'
import { sessionForAgent } from './floor-model'
import { doorSignPlacement, roomWallSegments, type WallSegment } from './room-layout'
import {
  combineActivity,
  hasObservedFeed,
  isActivityAvailable,
  summariseActivity,
  type ActivitySummary
} from './activity-summary'

export interface OfficeProjectRow {
  projectKey: string
  label: string
  zoneId: string | null
  agentCount: number
  attentionCount: number
}

export interface OfficeCompanyRow {
  companyKey: string
  label: string
  zoneId: string | null
  agentCount: number
  attentionCount: number
  projects: OfficeProjectRow[]
}

export interface CompanyListEntry {
  companyKey: string
  label: string
  projects: { projectKey: string; label: string; agents: AgentView[] }[]
}

function allZones(zones: readonly ZoneGeometry[]): ZoneGeometry[] {
  return zones.flatMap((zone) => [zone, ...allZones(zone.children)])
}

export function findZone(floor: FloorGeometry, zoneId: string): ZoneGeometry | undefined {
  return allZones(floor.zones).find((zone) => zone.id === zoneId)
}

const SIGN_OFFSET_M = 0.1
export const COMPANY_GATE_WIDTH = 3.2
export const PROJECT_DOOR_WIDTH = 1.6

function doorOf(zone: ZoneGeometry): { x: number; z: number } {
  return zone.door ?? { x: zone.x, z: zone.z + zone.depth / 2 }
}

// Perimeter walls with one opening: a wide gate for a company, a door for a project office.
export function zoneWalls(zone: ZoneGeometry): WallSegment[] {
  const gap = zone.kind === 'company' ? COMPANY_GATE_WIDTH : PROJECT_DOOR_WIDTH
  return roomWallSegments({ ...zone, door: doorOf(zone) }, gap)
}

// Signs face out of the zone at its door; a doorless zone gets its sign on the front (+z) edge.
export function zoneSignPlacement(zone: ZoneGeometry): { x: number; z: number; rotationY: number } {
  if (zone.door) return doorSignPlacement({ ...zone, door: zone.door })
  return { x: zone.x, z: zone.z + zone.depth / 2 + SIGN_OFFSET_M, rotationY: 0 }
}

interface Grouped {
  companyKey: string
  companyLabel: string
  projectKey: string
  projectLabel: string
  agents: AgentView[]
  sessions: SessionRef[]
}

// Sessions carry the company and project; agents reach their session through their room.
function groupByProject(frame: OfficeFrame): Map<string, Grouped> {
  const groups = new Map<string, Grouped>()
  const groupFor = (session: SessionRef): Grouped => {
    const existing = groups.get(session.projectKey)
    if (existing) return existing
    const created: Grouped = {
      companyKey: session.companyKey,
      companyLabel: session.companyLabel,
      projectKey: session.projectKey,
      projectLabel: session.projectLabel,
      agents: [],
      sessions: []
    }
    groups.set(session.projectKey, created)
    return created
  }
  for (const session of frame.sessions) groupFor(session).sessions.push(session)
  for (const agent of frame.agents) {
    const session = sessionForAgent(frame, agent)
    if (session) groupFor(session).agents.push(agent)
  }
  return groups
}

export function buildOfficeActivity(frame: OfficeFrame | null) {
  const isAvailable = frame ? isActivityAvailable(frame) : false
  const projects = new Map<string, ActivitySummary>()
  const companies = new Map<string, ActivitySummary>()
  if (frame) {
    for (const group of groupByProject(frame).values()) {
      const summary = evidencedActivity({
        frame,
        agents: group.agents,
        isAvailable: isActivityAvailable(frame, [
          ...group.agents.map((agent) => agent.provider),
          ...group.sessions.map((session) => session.provider)
        ])
      })
      projects.set(group.projectKey, summary)
      const previous = companies.get(group.companyKey)
      companies.set(
        group.companyKey,
        combineActivity(previous ? [previous, summary] : [summary], frame.connected)
      )
    }
  }
  return {
    office: frame
      ? evidencedActivity({ frame, agents: frame.agents, isAvailable })
      : summariseActivity([], false),
    projects,
    companies
  }
}

function evidencedActivity({
  frame,
  agents,
  isAvailable
}: {
  frame: OfficeFrame
  agents: readonly AgentView[]
  isAvailable: boolean
}): ActivitySummary {
  if (!hasObservedFeed(frame)) return summariseActivity(agents, isAvailable)
  const reports = agents.map((agent) =>
    observeAgent({ ...frame, agentKey: agent.agentKey, nowMs: Date.now() })
  )
  return summariseActivity(
    reports.flatMap((report) =>
      report.activity !== undefined && report.attention !== undefined
        ? [{ activity: report.activity, attention: report.attention }]
        : []
    ),
    isAvailable &&
      reports.every(
        (report) =>
          report.status === 'fresh' &&
          report.attention !== undefined &&
          report.activity !== undefined
      )
  )
}

function projectRow(
  projectKey: string,
  label: string,
  zoneId: string | null,
  group?: Grouped
): OfficeProjectRow {
  return {
    projectKey,
    label,
    zoneId,
    agentCount: group?.agents.length ?? 0,
    attentionCount: group?.sessions.filter((session) => needsHuman(session.attention)).length ?? 0
  }
}

function sum(rows: readonly OfficeProjectRow[], field: 'agentCount' | 'attentionCount'): number {
  return rows.reduce((total, row) => total + row[field], 0)
}

// Company › Project for the Offices panel: zones give the order and fly-to targets; sessions
// whose project has no zone yet are still listed so nothing is hidden.
export function buildOfficesTree(frame: OfficeFrame): OfficeCompanyRow[] {
  return officesTree(frame, groupByProject(frame))
}

function officesTree(frame: OfficeFrame, groups: Map<string, Grouped>): OfficeCompanyRow[] {
  const seenProjects = new Set<string>()
  const companies = new Map<string, OfficeCompanyRow>()

  for (const zone of frame.floors.flatMap((floor) => floor.zones)) {
    if (zone.kind !== 'company') continue
    const projects = zone.children.flatMap((child) => {
      const { projectKey } = child
      if (child.kind !== 'project' || !projectKey) return []
      seenProjects.add(projectKey)
      return [projectRow(projectKey, child.label, child.id, groups.get(projectKey))]
    })
    const companyKey = zone.companyKey ?? zone.id
    const previous = companies.get(companyKey)
    const knownProjects = new Set(previous?.projects.map((project) => project.projectKey))
    companies.set(companyKey, {
      companyKey,
      label: zone.label,
      zoneId: previous?.zoneId ?? zone.id,
      agentCount: 0,
      attentionCount: 0,
      projects: [
        ...(previous?.projects ?? []),
        ...projects.filter((project) => !knownProjects.has(project.projectKey))
      ]
    })
  }

  for (const group of groups.values()) {
    if (seenProjects.has(group.projectKey)) continue
    const company =
      companies.get(group.companyKey) ??
      ({
        companyKey: group.companyKey,
        label: group.companyLabel,
        zoneId: null,
        agentCount: 0,
        attentionCount: 0,
        projects: []
      } satisfies OfficeCompanyRow)
    company.projects.push(projectRow(group.projectKey, group.projectLabel, null, group))
    companies.set(group.companyKey, company)
  }

  return [...companies.values()].map((company) => ({
    ...company,
    agentCount: sum(company.projects, 'agentCount'),
    attentionCount: sum(company.projects, 'attentionCount')
  }))
}

// Main agent first, each followed by its own subagents.
function orderAgents(frame: OfficeFrame, agents: readonly AgentView[]): AgentView[] {
  const bySession = (agent: AgentView): string =>
    sessionForAgent(frame, agent)?.key ?? agent.agentKey
  return [...agents].sort(
    (a, b) =>
      bySession(a).localeCompare(bySession(b)) ||
      Number(a.isSubagent) - Number(b.isSubagent) ||
      a.label.localeCompare(b.label)
  )
}

export function buildCompanyList(frame: OfficeFrame): CompanyListEntry[] {
  const groups = groupByProject(frame)
  return officesTree(frame, groups)
    .map((company) => ({
      companyKey: company.companyKey,
      label: company.label,
      projects: company.projects
        .map((project) => ({
          projectKey: project.projectKey,
          label: project.label,
          agents: orderAgents(frame, groups.get(project.projectKey)?.agents ?? [])
        }))
        .filter((project) => project.agents.length > 0)
    }))
    .filter((company) => company.projects.length > 0)
}
