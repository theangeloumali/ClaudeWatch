import { useSyncExternalStore } from 'react'
import { isJsonObject } from '../../../shared/json-object'
import { browserStorage } from '../../office-live/browser-storage'
import type { FloorGeometry, RoomGeometry, ZoneGeometry } from '../scene-model'
import { listThemes } from '../themes/registry'
import type { OfficeCompanyRow, OfficeProjectRow } from './zone-model'

export const OFFICE_THEMES_STORAGE_KEY = 'claudewatch.office.themes'
const STORAGE_VERSION = 1

type ThemeIdsByKey = Readonly<Record<string, string>>

export interface ThemeAssignments {
  version: typeof STORAGE_VERSION
  companies: ThemeIdsByKey
  projects: ThemeIdsByKey
}

export type ThemedZone = Pick<ZoneGeometry, 'companyKey' | 'projectKey'> & { themeId?: string }
export type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>

// What one theme draws on a floor that mixes themes.
export interface ThemeZoneGroup {
  themeId: string
  companies: ZoneGeometry[]
  projects: ZoneGeometry[]
  rooms: RoomGeometry[]
}

export const EMPTY_THEME_ASSIGNMENTS: ThemeAssignments = {
  version: STORAGE_VERSION,
  companies: {},
  projects: {}
}

function isKnownTheme(themeId: string): boolean {
  return listThemes().some((theme) => theme.id === themeId)
}

// Own members only: a key such as "constructor" must not read Object.prototype.
function assignedThemeId(themeIds: ThemeIdsByKey, key: string | null): string | undefined {
  return key !== null && Object.hasOwn(themeIds, key) ? themeIds[key] : undefined
}

// Project override, else the company's theme, else the floor's default.
export function resolveTheme(
  zone: ThemedZone,
  assignments: ThemeAssignments,
  defaultThemeId: string
): string {
  return (
    zone.themeId ??
    assignedThemeId(assignments.projects, zone.projectKey) ??
    assignedThemeId(assignments.companies, zone.companyKey) ??
    defaultThemeId
  )
}

// What a theme choice applies to: no keys is the floor, and a project carries its company's key too.
export type ThemeTarget = ThemedZone & { label: string }

export const EVERY_OFFICE: ThemeTarget = {
  companyKey: null,
  projectKey: null,
  label: 'Every office'
}

export interface ThemeRow {
  target: ThemeTarget
  themeId: string
  // Null while it follows its parent.
  ownThemeId: string | null
  followsLabel: string
  inheritedThemeId: string
}

export interface CompanyThemeRow extends ThemeRow {
  projects: ThemeRow[]
}

type ThemedCompany = Pick<OfficeCompanyRow, 'companyKey' | 'label'> & {
  projects: readonly Pick<OfficeProjectRow, 'projectKey' | 'label'>[]
}

export function buildThemeRows(
  companies: readonly ThemedCompany[],
  assignments: ThemeAssignments,
  defaultThemeId: string
): CompanyThemeRow[] {
  return companies.map((company) => {
    const ownThemeId = assignedThemeId(assignments.companies, company.companyKey) ?? null
    const themeId = ownThemeId ?? defaultThemeId
    return {
      target: { companyKey: company.companyKey, projectKey: null, label: company.label },
      themeId,
      ownThemeId,
      followsLabel: 'the floor',
      inheritedThemeId: defaultThemeId,
      projects: company.projects.map((project) => {
        const ownProjectThemeId = assignedThemeId(assignments.projects, project.projectKey) ?? null
        return {
          target: {
            companyKey: company.companyKey,
            projectKey: project.projectKey,
            label: project.label
          },
          themeId: ownProjectThemeId ?? themeId,
          ownThemeId: ownProjectThemeId,
          followsLabel: company.label,
          inheritedThemeId: themeId
        }
      })
    }
  })
}

export function countThemeChoices(assignments: ThemeAssignments): number {
  return Object.keys(assignments.companies).length + Object.keys(assignments.projects).length
}

// Every change names its scope, so one office changing is never mistaken for all of them.
export function themeChangeNotice(
  target: ThemeTarget,
  themeLabel: string,
  isFollowing: boolean
): string {
  const isProject = target.projectKey !== null
  const change = isFollowing
    ? `now follows ${isProject ? 'its company' : 'the floor'}: ${themeLabel}`
    : `is now ${themeLabel}`
  const untouched = isProject
    ? 'Other offices keep their themes.'
    : 'Projects with their own theme and other companies keep theirs.'
  return `${target.label} ${isProject ? 'office' : 'company'} ${change}. ${untouched}`
}

export function everyOfficeNotice(themeLabel: string, removedCount: number): string {
  const applied = `Every office is now ${themeLabel}.`
  if (removedCount === 0) return applied
  return removedCount === 1
    ? `${applied} 1 company or project choice was removed.`
    : `${applied} ${removedCount} company and project choices were removed.`
}

const UNASSIGNED_ZONE: ThemedZone = { companyKey: null, projectKey: null }

// A project's leaf zones share their ids with the floor's rooms, so a room takes its project's theme.
export function groupZonesByTheme(
  floor: FloorGeometry,
  themeIdFor: (zone: ThemedZone) => string
): ThemeZoneGroup[] {
  const groups = new Map<string, ThemeZoneGroup>()
  const groupFor = (themeId: string): ThemeZoneGroup => {
    const existing = groups.get(themeId)
    if (existing) return existing
    const created: ThemeZoneGroup = { themeId, companies: [], projects: [], rooms: [] }
    groups.set(themeId, created)
    return created
  }
  const themeIdByRoom = new Map<string, string>()
  for (const company of floor.zones) {
    if (company.kind !== 'company') continue
    groupFor(themeIdFor(company)).companies.push(company)
    for (const project of company.children) {
      if (project.kind !== 'project') continue
      const themeId = themeIdFor(project)
      groupFor(themeId).projects.push(project)
      for (const leaf of project.children) themeIdByRoom.set(leaf.id, themeId)
    }
  }
  for (const room of floor.rooms)
    groupFor(room.themeId ?? themeIdByRoom.get(room.id) ?? themeIdFor(UNASSIGNED_ZONE)).rooms.push(
      room
    )
  return [...groups.values()]
}

function knownThemeIds(value: unknown): ThemeIdsByKey {
  if (!isJsonObject(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && isKnownTheme(entry[1])
    )
  )
}

// Stored settings are checked by shape: anything that is not a known theme id is dropped.
export function parseThemeAssignments(raw: string | null): ThemeAssignments {
  if (raw === null) return EMPTY_THEME_ASSIGNMENTS
  let stored: unknown
  try {
    stored = JSON.parse(raw)
  } catch {
    return EMPTY_THEME_ASSIGNMENTS
  }
  if (!isJsonObject(stored) || stored.version !== STORAGE_VERSION) return EMPTY_THEME_ASSIGNMENTS
  return {
    version: STORAGE_VERSION,
    companies: knownThemeIds(stored.companies),
    projects: knownThemeIds(stored.projects)
  }
}

type Scope = 'companies' | 'projects'

export interface OfficeThemeStore {
  getAssignments(): ThemeAssignments
  setCompanyTheme(companyKey: string, themeId: string): void
  clearCompanyTheme(companyKey: string): void
  setProjectTheme(projectKey: string, themeId: string): void
  clearProjectTheme(projectKey: string): void
  clearAll(): void
  subscribe(listener: () => void): () => void
}

// The window's `storage` event: another page on this origin saved its assignments.
type StorageEvents = Pick<Window, 'addEventListener' | 'removeEventListener'>

const isSame = (a: ThemeAssignments, b: ThemeAssignments): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

export function createOfficeThemeStore(
  storage: ThemeStorage | null,
  storageEvents: StorageEvents | null = null
): OfficeThemeStore {
  const listeners = new Set<() => void>()
  let assignments = EMPTY_THEME_ASSIGNMENTS
  // Once a write fails nothing here reaches storage, so storage stops being the newer copy.
  let canPersist = storage !== null

  const adopt = (next: ThemeAssignments): void => {
    if (isSame(next, assignments)) return
    assignments = next
    for (const listener of listeners) listener()
  }
  // Another Office page may have saved since this one last looked.
  const latest = (): ThemeAssignments => {
    if (!canPersist) return assignments
    try {
      return parseThemeAssignments(storage?.getItem(OFFICE_THEMES_STORAGE_KEY) ?? null)
    } catch {
      // A locked-down storage backend leaves every zone on what this page already holds.
      return assignments
    }
  }
  assignments = latest()

  const commit = (next: ThemeAssignments): void => {
    try {
      storage?.setItem(OFFICE_THEMES_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // The choice still applies for this session when it cannot be saved.
      canPersist = false
    }
    adopt(next)
  }
  const assign = (scope: Scope, key: string, themeId: string): void => {
    if (!key || !isKnownTheme(themeId)) return
    const current = latest()
    if (assignedThemeId(current[scope], key) === themeId) return adopt(current)
    commit({ ...current, [scope]: { ...current[scope], [key]: themeId } })
  }
  const clear = (scope: Scope, key: string): void => {
    const current = latest()
    if (assignedThemeId(current[scope], key) === undefined) return adopt(current)
    const { [key]: _removed, ...kept } = current[scope]
    commit({ ...current, [scope]: kept })
  }
  // `key` is null when the other page cleared all of its storage.
  const onStorage = (event: StorageEvent): void => {
    if (event.key === OFFICE_THEMES_STORAGE_KEY || event.key === null) adopt(latest())
  }

  return {
    getAssignments: () => assignments,
    setCompanyTheme: (companyKey, themeId) => assign('companies', companyKey, themeId),
    clearCompanyTheme: (companyKey) => clear('companies', companyKey),
    setProjectTheme: (projectKey, themeId) => assign('projects', projectKey, themeId),
    clearProjectTheme: (projectKey) => clear('projects', projectKey),
    clearAll: () => commit(EMPTY_THEME_ASSIGNMENTS),
    subscribe: (listener) => {
      if (listeners.size === 0) storageEvents?.addEventListener('storage', onStorage)
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) storageEvents?.removeEventListener('storage', onStorage)
      }
    }
  }
}

export const officeThemes = createOfficeThemeStore(browserStorage(), window)

export function useThemeAssignments(): ThemeAssignments {
  return useSyncExternalStore(officeThemes.subscribe, officeThemes.getAssignments)
}
