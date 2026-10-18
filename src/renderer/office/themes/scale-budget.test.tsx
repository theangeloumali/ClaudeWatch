import { expect, it, vi } from 'vitest'
import { Texture } from 'three'
import {
  ADDED_DRAWS_PER_THEME,
  agentsOn,
  BRASS,
  DRAW_CEILING,
  EDO,
  measure,
  REAL_THEMES,
  scaled,
  THREE_THEMES,
  TRIANGLE_CEILING
} from './live-budget.test-utils'
import { registerTheme } from './registry'
import type { OfficeTheme } from './types'

// Full sim or scene builds: the 5 s default times out under multi-agent load (health-9).
vi.setConfig({ testTimeout: 60_000 })

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => object) => factory(),
  useLayoutEffect: () => undefined,
  useRef: (current: object) => ({ current })
}))
vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined }))
vi.mock('@react-three/drei', () => ({ CameraControlsImpl: class {} }))
vi.mock('../scene/textures', () => ({
  signTexture: () => new Texture(),
  blobShadowTexture: () => new Texture()
}))

it.each([
  [20, 4],
  [30, 4],
  [40, 4],
  [60, 10]
])(
  '%i agents in %i companies on a three-theme floor stay inside the draw ceiling',
  (agents, companies) => {
    const result = scaled(THREE_THEMES, agents, companies)
    expect(result.themeCount).toBe(3)
    expect(result.draws).toBeLessThanOrEqual(DRAW_CEILING)
    expect(result.triangles).toBeLessThanOrEqual(TRIANGLE_CEILING)
  }
)

// The same theme with no world of its own: what its offices and agents cost alone.
function bare(theme: OfficeTheme): OfficeTheme {
  const { Lounge, Ambient, ...zone } = theme.kit.zone
  void Lounge
  void Ambient
  const stripped = { ...theme, id: `test-bare-${theme.id}`, kit: { ...theme.kit, zone } }
  registerTheme(stripped)
  return stripped
}

for (const theme of REAL_THEMES) {
  const unfilled = bare(theme)
  it(`${theme.id} adds at most ${ADDED_DRAWS_PER_THEME} draws for its surroundings, lounge and ambient life`, () => {
    const composition = agentsOn(4, 40)
    expect(composition.floor.zones.every((company) => company.lounge)).toBe(true)
    const filled = measure({ ...composition, floorTheme: theme, themeIdFor: () => theme.id })
    const empty = measure({ ...composition, floorTheme: unfilled, themeIdFor: () => unfilled.id })
    const loungeDraws = filled.focusedDraws - empty.focusedDraws
    console.info(
      `${theme.id} adds ${filled.surroundingsDraws} draws around the offices and ${loungeDraws} for its lounges`
    )
    // A theme with none of the three parts adds nothing but the ground.
    expect(empty.surroundingsDraws).toBe(0)
    expect(empty.horizonDraws).toBe(1)
    expect(filled.horizonDraws).toBe(1)
    expect(filled.lotCount).toBeGreaterThan(40)
    expect(filled.triangles).toBeLessThanOrEqual(TRIANGLE_CEILING)
    expect(filled.surroundingsDraws + loungeDraws).toBeLessThanOrEqual(ADDED_DRAWS_PER_THEME)
  })
}

const BUSY_FLOORS = [
  [20, 4],
  [40, 4],
  [60, 10]
]

it.each(BUSY_FLOORS)(
  '%i agents in %i companies on Neo Edo Steam, Brass Workshop and Orbital Garrison stay inside the draw ceiling',
  (agents, companies) => {
    const result = scaled([EDO, BRASS, 'orbital-garrison'], agents, companies)
    expect(result.themeCount).toBe(3)
    expect(result.draws).toBeLessThanOrEqual(DRAW_CEILING)
    expect(result.triangles).toBeLessThanOrEqual(TRIANGLE_CEILING)
  }
)

it.each(BUSY_FLOORS)(
  '%i agents in %i companies on every shipped theme at once stay inside the draw ceiling',
  (agents, companies) => {
    const themeIds = REAL_THEMES.map((theme) => theme.id)
    const result = scaled(themeIds, agents, Math.max(companies, themeIds.length))
    expect(result.themeCount).toBe(themeIds.length)
    expect(result.triangles).toBeLessThanOrEqual(TRIANGLE_CEILING)
    expect(result.draws).toBeLessThanOrEqual(DRAW_CEILING)
  }
)

// What an agent may add once the floor's parts are merged: the textured door sign of its room.
// The city grows with the offices round it, so its draws are left to the ceilings above.
const DRAWS_PER_AGENT = 1

it.each([
  ...REAL_THEMES.map((theme) => [theme.id, [theme.id]] as const),
  ['three themes', THREE_THEMES] as const
])('%s adds at most one draw per agent', (_name, themeIds) => {
  const officeDraws = (agents: number): number => {
    const result = scaled(themeIds, agents, 4)
    return result.draws - result.townDraws
  }
  const perAgent = (officeDraws(40) - officeDraws(20)) / 20
  expect(perAgent).toBeLessThanOrEqual(DRAWS_PER_AGENT)
})
