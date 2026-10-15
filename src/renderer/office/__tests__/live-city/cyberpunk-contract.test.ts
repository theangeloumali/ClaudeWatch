import { describe, expect, it } from 'vitest'
import { cyberpunkCity } from '../../themes/cyberpunk-city'
import { CYBERPUNK_CAST, cyberpunkRoster } from '../../themes/cyberpunk-city/roster'
import { characterParts } from '../../themes/cyberpunk-city/character-parts'
import { corporateCity } from '../../themes/corporate-city'
import { ROSTER_NAMES_STORAGE_KEY } from '../../themes/roster-names'

describe('standalone Cyberpunk City contract', () => {
  it('owns its model, palette, kit and authored town instead of aliasing Corporate City', () => {
    expect(cyberpunkCity.robot.Model).not.toBe(corporateCity.robot.Model)
    expect(cyberpunkCity.kit).not.toBe(corporateCity.kit)
    expect(cyberpunkCity.town).not.toBe(corporateCity.town)
    expect(cyberpunkCity.palette).not.toBe(corporateCity.palette)
    expect(cyberpunkCity.robot.applyPose).toBeDefined()
    expect(cyberpunkCity.playerGeometry).toBeDefined()
  })

  it('keeps provider factions distinct for both leads and squads', () => {
    for (const provider of ['claude', 'codex', 'opencode'] as const) {
      for (const isSubagent of [false, true]) {
        const index = cyberpunkRoster.indexFor({ provider, isSubagent, agentKey: 'stable-key' }, 3)
        expect(CYBERPUNK_CAST[index].provider).toBe(provider)
        expect(CYBERPUNK_CAST[index].isSquad).toBe(isSubagent)
      }
    }
    expect(new Set(CYBERPUNK_CAST.map((entry) => entry.kind)).size).toBeGreaterThanOrEqual(7)
    const signatures = CYBERPUNK_CAST.map((entry) =>
      JSON.stringify(
        characterParts({
          kind: entry.kind,
          variant: 0,
          palette: cyberpunkCity.palette
        }).joints
      )
    )
    expect(new Set(signatures).size).toBeGreaterThanOrEqual(7)
  })

  it('reads existing owner name overrides without writing or mutating cast metadata', () => {
    const original = CYBERPUNK_CAST[0].name
    const storage = {
      getItem: (key: string) =>
        key === ROSTER_NAMES_STORAGE_KEY
          ? JSON.stringify({ 'cyberpunk-city': ['Owner alias'], 'violet-court': ['Retained'] })
          : null
    }
    expect(cyberpunkRoster.entries(storage)[0].name).toBe('Owner alias')
    expect(CYBERPUNK_CAST[0].name).toBe(original)
  })

  it('authors distinct bounded venues in every district with fixed part counts', () => {
    const designs = cyberpunkCity.town?.designs ?? []
    expect(designs.map((design) => design.name)).toEqual(
      expect.arrayContaining([
        'relay tower',
        'night market',
        'repair garage',
        'transit interchange',
        'arcade hall',
        'food court'
      ])
    )
    const signatures = new Set<string>()
    for (const design of designs) {
      const plot = { width: 5, depth: 4, height: design.height.max, seed: 123, accent: '#fff' }
      const parts = design.build(plot)
      expect(parts.length).toBeLessThanOrEqual(32)
      expect(design.build({ ...plot, height: 100 }).length).toBe(parts.length)
      for (const part of parts) {
        expect(Math.abs(part.at[0]) + part.size[0] / 2).toBeLessThanOrEqual(plot.width / 2 + 0.001)
        expect(Math.abs(part.at[2]) + part.size[2] / 2).toBeLessThanOrEqual(plot.depth / 2 + 0.001)
        expect(part.at[1] - part.size[1] / 2).toBeGreaterThanOrEqual(-0.001)
        expect(part.at[1] + part.size[1] / 2).toBeLessThanOrEqual(plot.height + 0.001)
      }
      signatures.add(JSON.stringify(parts.map(({ shape, at, size }) => ({ shape, at, size }))))
    }
    expect(signatures.size).toBe(designs.length)
    for (const district of [
      'civic',
      'market',
      'entertainment',
      'residential',
      'workshop',
      'park'
    ] as const)
      expect(designs.some((design) => design.zones.includes(district))).toBe(true)
  })
})
