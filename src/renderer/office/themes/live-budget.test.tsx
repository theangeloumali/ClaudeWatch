import { expect, it, vi } from 'vitest'
import { Texture } from 'three'
import { createElement, type ComponentType } from 'react'
import { buildFixtureFrame } from '../fixture/fixture-feed'
import type { ThemedZone } from '../logic/office-themes'
import {
  agentsOn,
  BRASS,
  companyThemes,
  DRAW_CEILING,
  EDO,
  measure,
  REAL_THEMES,
  report,
  scaled,
  THREE_THEMES,
  TRIANGLE_CEILING
} from './live-budget.test-utils'
import { getTheme, registerTheme } from './registry'

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
  useSignTexture: () => new Texture(),
  blobShadowTexture: () => new Texture()
}))

for (const theme of REAL_THEMES)
  it(`${theme.id} live composition with 20 agents stays below 300 draws and 600k triangles`, () => {
    const result = measure({ ...agentsOn(1), floorTheme: theme, themeIdFor: () => theme.id })
    report(`${theme.id} live, 20 agents`, result)
    expect(result.draws).toBeLessThanOrEqual(DRAW_CEILING)
    expect(result.triangles).toBeLessThanOrEqual(TRIANGLE_CEILING)
  })

it.each([
  [20, 4],
  [40, 4],
  [60, 10]
])('three themes with %i agents and the zoned town stay within 300 draws', (agents, companies) => {
  const result = scaled(THREE_THEMES, agents, companies)
  expect(result.themeCount).toBe(3)
  // The ground is one draw. The city's cutaway batches its lots by side and height band, each
  // costing a draw per unit shape and surface, never per building: the ceiling holds them all.
  expect(result.townDraws).toBeGreaterThan(1)
  expect(result.draws).toBeLessThanOrEqual(DRAW_CEILING)
  expect(result.triangles).toBeLessThanOrEqual(TRIANGLE_CEILING)
})

// A stand-in for a theme that shares no part with another: Brass's cost, merged only with itself.
function unshared<Props extends object>(Component: ComponentType<Props>): ComponentType<Props> {
  return (props: Props) =>
    createElement('group', { unshared: true }, createElement(Component, props))
}
const brass = getTheme(BRASS)
const UNSHARED = 'test-unshared'
registerTheme({
  ...brass,
  id: UNSHARED,
  robot: { ...brass.robot, Model: unshared(brass.robot.Model) },
  kit: {
    ...brass.kit,
    zone: {
      CompanyZone: unshared(brass.kit.zone.CompanyZone),
      ProjectOffice: unshared(brass.kit.zone.ProjectOffice),
      RoomFloors: unshared(brass.kit.zone.RoomFloors),
      Walls: unshared(brass.kit.zone.Walls),
      Doorway: unshared(brass.kit.zone.Doorway),
      Desk: unshared(brass.kit.zone.Desk),
      RoomDressing: unshared(brass.kit.zone.RoomDressing),
      RoomSign: unshared(brass.kit.zone.RoomSign)
    }
  }
})

it('four companies alternating the two built-in themes stay inside the draw ceiling', () => {
  const result = measure({
    ...agentsOn(4),
    floorTheme: getTheme(EDO),
    themeIdFor: companyThemes([EDO, BRASS])
  })
  report('edo + brass, 4 companies, 20 agents', result)
  expect(result.themeCount).toBe(2)
  expect(result.draws).toBeLessThanOrEqual(DRAW_CEILING)
  expect(result.triangles).toBeLessThanOrEqual(TRIANGLE_CEILING)
})

it('four companies alternating Neo Edo Steam and Violet Court stay inside the draw ceiling', () => {
  const result = measure({
    ...agentsOn(4),
    floorTheme: getTheme(EDO),
    themeIdFor: companyThemes([EDO, 'violet-court'])
  })
  report('edo + violet court, 4 companies, 20 agents', result)
  expect(result.themeCount).toBe(2)
  expect(result.draws).toBeLessThanOrEqual(DRAW_CEILING)
  expect(result.triangles).toBeLessThanOrEqual(TRIANGLE_CEILING)
})

it.each([
  ['Neo Edo Steam and Orbital Garrison', [EDO, 'orbital-garrison']],
  ['Neo Edo Steam, Violet Court and Orbital Garrison', [EDO, 'violet-court', 'orbital-garrison']]
])('four companies on %s stay inside the draw ceiling', (name, themeIds) => {
  // An unregistered id would be measured as Neo Edo Steam.
  for (const themeId of themeIds) expect(getTheme(themeId).id).toBe(themeId)
  const result = measure({
    ...agentsOn(4),
    floorTheme: getTheme(EDO),
    themeIdFor: companyThemes(themeIds)
  })
  report(`${name}, 4 companies, 20 agents`, result)
  expect(result.themeCount).toBe(themeIds.length)
  expect(result.draws).toBeLessThanOrEqual(DRAW_CEILING)
  expect(result.triangles).toBeLessThanOrEqual(TRIANGLE_CEILING)
})

it('a third theme that shares nothing still fits four companies inside the draw ceiling', () => {
  const result = measure({
    ...agentsOn(4),
    floorTheme: getTheme(EDO),
    themeIdFor: companyThemes([EDO, BRASS, UNSHARED])
  })
  report('edo + brass + unshared, 4 companies, 20 agents', result)
  expect(result.themeCount).toBe(3)
  expect(result.draws).toBeLessThanOrEqual(DRAW_CEILING)
})

it('reports the preview fixture floor with one, two and three themes', () => {
  const { floors, agents } = buildFixtureFrame(0, 0)
  const companyKeys = floors[0].zones.map((zone) => zone.companyKey)
  const projectKeys = floors[0].zones.flatMap((zone) => zone.children.map((p) => p.projectKey))
  const compositions: [string, (zone: ThemedZone) => string][] = [
    ['fixture, 1 theme', () => EDO],
    ['fixture, 2 themes', (zone) => (zone.companyKey === companyKeys[0] ? BRASS : EDO)],
    [
      'fixture, 3 themes',
      (zone) =>
        zone.projectKey === projectKeys.at(-1)
          ? UNSHARED
          : zone.companyKey === companyKeys[0]
            ? BRASS
            : EDO
    ]
  ]
  compositions.forEach(([name, themeIdFor], index) => {
    const result = measure({ floor: floors[0], agents, floorTheme: getTheme(EDO), themeIdFor })
    report(`${name}, ${agents.length} agents`, result)
    expect(result.themeCount).toBe(index + 1)
    expect(result.draws).toBeLessThanOrEqual(DRAW_CEILING)
  })
})
