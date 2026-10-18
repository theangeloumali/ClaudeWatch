import { expect, it, vi } from 'vitest'
import { useSceneFloorData } from '../../scene/use-scene-floor-data'
import { getTheme } from '../../themes/registry'
import { makeFloor } from '../fixtures'
import { EMPTY_THEME_ASSIGNMENTS } from '../../logic/office-themes'

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory()
}))
vi.mock('../../logic/office-themes', async (original) => ({
  ...(await original<typeof import('../../logic/office-themes')>()),
  useThemeAssignments: () => EMPTY_THEME_ASSIGNMENTS
}))

it('keeps preview and selected-floor geometry out of the live town topology', () => {
  const actual = makeFloor({ floorId: 'actual', x: 0 })
  const preview = { ...actual, x: 500 }
  const data = useSceneFloorData({
    floor: actual,
    visibleFloors: [preview],
    ...{ allFloors: [actual] },
    theme: getTheme('corporate-city'),
    agents: [],
    sessions: [],
    selectedAgentKey: null,
    speakingAgentKey: null
  })
  expect(data.townFloor.x).toBe(0)
  expect(data.surfaces[0].x).toBe(500)
})
