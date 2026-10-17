import { createElement } from 'react'
import { Texture } from 'three'
import { expect, it, vi } from 'vitest'
import { makeSession } from '../__tests__/fixtures'
import { layoutFloor } from '../fixture/fixture-layout'
import { groupZonesByTheme } from '../logic/office-themes'
import type { FloorGeometry } from '../scene-model'
import { FloorView } from '../scene/FloorView'
import { gameCornerFixture } from './game-corner.test-utils'
import { REAL_THEMES } from './live-budget.test-utils'
import { everyElement, mergedDraws } from './scene.test-utils'
import type { OfficeTheme } from './types'

// The views are called as plain functions, as live-budget measures them.
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => object) => factory(),
  useLayoutEffect: () => undefined,
  useRef: (current: object) => ({ current })
}))
vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined }))
vi.mock('../scene/textures', () => ({
  useSignTexture: () => new Texture(),
  blobShadowTexture: () => new Texture()
}))

// What every corner of one theme on a floor may add: their glowing screens share one draw.
const CORNER_DRAWS = 1

// Two companies, each with a corner facing a different way.
function floorWithCorners(): FloorGeometry {
  const sessions = Array.from({ length: 6 }, (_, index) =>
    makeSession({
      key: `claude:${index}`,
      companyKey: `c_${index % 2}`,
      companyLabel: `Company ${index % 2}`,
      projectKey: `p_${index % 2}`,
      projectLabel: `Project ${index % 2}`
    })
  )
  const floor = layoutFloor({ sessions })
  expect(floor.zones).toHaveLength(2)
  const headings = [0, Math.PI / 2]
  return {
    ...floor,
    zones: floor.zones.map((zone, index) => ({
      ...zone,
      lounge: gameCornerFixture(headings[index], 8, { x: zone.x, z: zone.z + 40 })
    }))
  }
}

const withoutCorners = (floor: FloorGeometry): FloorGeometry => ({
  ...floor,
  zones: floor.zones.map(({ lounge: _lounge, ...zone }) => zone)
})

function floorView(floor: FloorGeometry, theme: OfficeTheme, isOverview: boolean) {
  return createElement(FloorView, {
    floor,
    floorTheme: theme,
    zoneGroups: groupZonesByTheme(floor, () => theme.id),
    wallsMode: 'cutaway',
    isReducedMotion: true,
    isOverview
  })
}

const corners = floorWithCorners()

for (const theme of REAL_THEMES)
  for (const isOverview of [false, true])
    it(`${theme.id}${isOverview ? ' overview' : ''}: game corners add at most one draw`, () => {
      const view = floorView(corners, theme, isOverview)
      const drawnCorners = everyElement(view).filter(
        (element) => element.props.name === (isOverview ? 'overview-lounge' : 'game-corner')
      )
      expect(drawnCorners).toHaveLength(2)
      const added =
        mergedDraws(view).draws -
        mergedDraws(floorView(withoutCorners(corners), theme, isOverview)).draws
      console.info(`${theme.id}${isOverview ? ' overview' : ''}: corners add ${added} draws`)
      expect(added).toBeLessThanOrEqual(CORNER_DRAWS)
    })
