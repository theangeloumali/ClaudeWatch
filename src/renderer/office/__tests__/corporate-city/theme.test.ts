import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME_ID, getTheme, listThemes, themeForTeam } from '../../themes/registry'
import { parseThemeAssignments, resolveTheme } from '../../logic/office-themes'

describe('Corporate City registration and legacy compatibility', () => {
  it('defaults unconfigured offices to a complete corporate world with all providers', () => {
    expect(DEFAULT_THEME_ID).toBe('corporate-city')
    const theme = themeForTeam()
    expect(theme.id).toBe('corporate-city')
    expect(theme.label).toBe('Corporate City')
    expect(theme.town?.designs.length).toBeGreaterThan(6)
    expect(typeof theme.robot.applyPose).toBe('function')
    expect(typeof theme.playerGeometry).toBe('function')
    for (const provider of ['claude', 'codex', 'opencode'] as const)
      expect(theme.robot.skins[provider].label).toMatch(/Claude|Codex|OpenCode/)
    expect(listThemes().filter((entry) => entry.id === theme.id)).toHaveLength(1)
  })

  it('preserves saved legacy assignments and the original unknown-ID fallback', () => {
    for (const id of [
      'neo-edo-steam',
      'brass-workshop',
      'violet-court',
      'orbital-garrison',
      'quiet-grove'
    ])
      expect(getTheme(id).id).toBe(id)
    expect(getTheme('missing-legacy-id').id).toBe('neo-edo-steam')
    const choices = parseThemeAssignments(
      JSON.stringify({
        version: 1,
        companies: { company: 'violet-court' },
        projects: { project: 'brass-workshop' }
      })
    )
    expect(
      resolveTheme({ companyKey: 'company', projectKey: 'project' }, choices, 'corporate-city')
    ).toBe('brass-workshop')
    expect(
      resolveTheme({ companyKey: 'company', projectKey: null }, choices, 'corporate-city')
    ).toBe('violet-court')
    expect(
      resolveTheme({ companyKey: 'unconfigured', projectKey: null }, choices, 'corporate-city')
    ).toBe('corporate-city')
  })
})
