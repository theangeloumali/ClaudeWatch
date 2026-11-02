import { brassWorkshop, neoEdoSteam } from './builtins'
import { corporateCity } from './corporate-city'
import { cyberpunkCity } from './cyberpunk-city'
import { NIGHT_CAMPUS_ID, nightCampus } from './night-campus'
import { samuraiEmpire } from './samurai-empire'
import { orbitalGarrison } from './orbital-garrison'
import { quietGrove } from './quiet-grove'
import type { OfficeTheme, RosterAgent, RosterEntry } from './types'
import { violetCourt } from './violet-court'

export const DEFAULT_THEME_ID = 'corporate-city'
export const CAMPUS_THEME_ID = NIGHT_CAMPUS_ID
const themes = new Map<string, OfficeTheme>()

export function registerTheme(theme: OfficeTheme): void {
  if (themes.has(theme.id)) throw new Error(`Theme ${theme.id} already registered`)
  themes.set(theme.id, theme)
}

registerTheme(neoEdoSteam)
registerTheme(brassWorkshop)
registerTheme(violetCourt)
registerTheme(orbitalGarrison)
registerTheme(quietGrove)
registerTheme(samuraiEmpire)
registerTheme(cyberpunkCity)
registerTheme(corporateCity)
registerTheme(nightCampus)

export function getTheme(id: string): OfficeTheme {
  return themes.get(id) ?? neoEdoSteam
}

// The campus theme follows the world layout, so no one picks or assigns it.
export function listThemes(): OfficeTheme[] {
  return Array.from(themes.values()).filter((theme) => theme.id !== CAMPUS_THEME_ID)
}

export function themeForTeam(): OfficeTheme {
  return getTheme(DEFAULT_THEME_ID)
}

// The character an agent plays in a theme, or null where the theme has no cast.
export function themeCharacter(
  themeId: string,
  agent: RosterAgent,
  bay: number
): RosterEntry | null {
  const roster = getTheme(themeId).roster
  return roster?.entries()[roster.indexFor(agent, bay)] ?? null
}
