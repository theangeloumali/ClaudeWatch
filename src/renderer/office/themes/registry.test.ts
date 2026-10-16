import { describe, expect, it } from 'vitest'
import { GARRISON_CAST } from './orbital-garrison/cast'
import { orbitalGarrisonRoster } from './orbital-garrison/roster'
import { GROVE_CAST } from './quiet-grove/cast'
import { quietGroveRoster } from './quiet-grove/roster'
import {
  DEFAULT_THEME_ID,
  getTheme,
  listThemes,
  registerTheme,
  themeCharacter,
  themeForTeam
} from './registry'
import { COURT_CAST } from './violet-court/cast'
import { violetCourtRoster } from './violet-court/roster'

describe('theme registry', () => {
  it('preserves built-ins and the Neo Edo unknown-ID fallback while defaulting to Corporate City', () => {
    expect(DEFAULT_THEME_ID).toBe('corporate-city')
    expect(
      listThemes()
        .map((theme) => theme.id)
        .slice(0, 2)
    ).toEqual(['neo-edo-steam', 'brass-workshop'])
    expect(getTheme('brass-workshop').id).toBe('brass-workshop')
    expect(getTheme('missing')).toBe(getTheme('neo-edo-steam'))
    expect(themeForTeam()).toBe(getTheme(DEFAULT_THEME_ID))
  })
  it('provides every kit, world and provider member', () => {
    for (const theme of listThemes()) {
      expect(theme.label.length).toBeGreaterThan(0)
      expect(theme.description.length).toBeGreaterThan(0)
      expect(typeof theme.robot.Model).toBe('function')
      for (const key of ['Slab', 'Elevator']) {
        expect(typeof Reflect.get(theme.kit.floor, key)).toBe('function')
      }
      for (const key of [
        'CompanyZone',
        'ProjectOffice',
        'RoomFloors',
        'Walls',
        'Doorway',
        'Desk',
        'RoomDressing',
        'RoomSign'
      ]) {
        expect(typeof Reflect.get(theme.kit.zone, key)).toBe('function')
      }
      for (const provider of ['claude', 'codex'] as const) {
        expect(theme.robot.skins[provider]).toMatchObject({
          body: expect.any(String),
          trim: expect.any(String),
          eye: expect.any(String)
        })
      }
    }
  })
  it('rejects duplicate ids and protects the list from caller mutation', () => {
    expect(() => registerTheme(getTheme(DEFAULT_THEME_ID))).toThrow('already registered')
    const copy = listThemes()
    copy.pop()
    expect(listThemes()).toHaveLength(copy.length + 1)
  })
  it('can register a future team theme', () => {
    const theme = { ...getTheme(DEFAULT_THEME_ID), id: 'test-team' }
    registerTheme(theme)
    expect(getTheme('test-team')).toBe(theme)
  })
})

describe('theme characters', () => {
  const agents = [
    { provider: 'claude', isSubagent: false, agentKey: 'claude:a' },
    { provider: 'codex', isSubagent: false, agentKey: 'codex:b' },
    { provider: 'opencode', isSubagent: false, agentKey: 'opencode:c' },
    { provider: 'claude', isSubagent: true, agentKey: 'claude:a#1' },
    { provider: 'codex', isSubagent: true },
    { provider: 'opencode', isSubagent: true, agentKey: 'opencode:c#1' }
  ] as const
  const bays = [0, 1, 4, 5, 12]

  it('names the character an agent plays in each theme that has a cast', () => {
    for (const agent of agents)
      for (const bay of bays) {
        expect(themeCharacter('violet-court', agent, bay)?.id).toBe(
          COURT_CAST[violetCourtRoster.indexFor(agent, bay)].id
        )
        expect(themeCharacter('orbital-garrison', agent, bay)?.id).toBe(
          GARRISON_CAST[orbitalGarrisonRoster.indexFor(agent, bay)].id
        )
        expect(themeCharacter('quiet-grove', agent, bay)?.id).toBe(
          GROVE_CAST[quietGroveRoster.indexFor(agent, bay)].id
        )
      }
  })

  it('gives a character as the HUD shows it: an id, a name and a role, nothing else', () => {
    const lead = themeCharacter('orbital-garrison', agents[0], 0)
    expect(Object.keys(lead ?? {}).sort()).toEqual(['id', 'name', 'role'])
  })

  it('has no character in a theme without a cast, or in a theme that does not exist', () => {
    for (const themeId of ['neo-edo-steam', 'brass-workshop', 'no-such-theme'])
      expect(themeCharacter(themeId, agents[0], 0)).toBeNull()
  })

  it('gives every theme with a cast a roster whose index stays inside it', () => {
    const withCast = listThemes().filter((theme) => theme.roster)
    expect(withCast.map((theme) => theme.id)).toEqual([
      'violet-court',
      'orbital-garrison',
      'quiet-grove',
      'cyberpunk-city'
    ])
    for (const theme of withCast)
      for (const agent of agents)
        for (const bay of bays)
          expect(theme.roster?.entries()[theme.roster.indexFor(agent, bay)]).toBeDefined()
  })
})
