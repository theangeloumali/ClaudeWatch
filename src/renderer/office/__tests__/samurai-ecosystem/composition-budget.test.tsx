import { createElement } from 'react'
import { expect, it, vi } from 'vitest'
import { Texture } from 'three'
import {
  agentsOn,
  companyThemes,
  DRAW_CEILING,
  measure,
  report,
  TRIANGLE_CEILING
} from '../../themes/live-budget.test-utils'
import { getTheme } from '../../themes/registry'
import { groupZonesByTheme } from '../../logic/office-themes'
import { mergedDraws } from '../../themes/scene.test-utils'
import { WorkstationScreens } from '../../scene/WorkstationScreens'
import { buildWorkstationDisplays } from '../../logic/workstation-displays'
import { makeFrame, makeSession } from '../fixtures'
import { MoverLayer } from '../../citizens/MoverLayer'
import { distributedTown } from '../../town/distributed-town'
import { townOf } from '../../town/use-town-plan'
import { playerGeometry } from '../../player/figure'

// Full sim or scene builds: the 5 s default times out under multi-agent load (health-9).
vi.setConfig({ testTimeout: 60_000 })

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  memo: (component: unknown) => component,
  useMemo: (factory: () => unknown) => factory(),
  useRef: (current: unknown) => ({ current }),
  useEffect: () => undefined,
  useLayoutEffect: () => undefined
}))
vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined }))
vi.mock('@react-three/drei', () => ({ CameraControlsImpl: class {} }))
vi.mock('../../quality-store', () => ({
  useQualityChoice: () => ({ pin: 'full', chosen: 'full' })
}))
vi.mock('../../scene/textures', () => ({
  signTexture: () => new Texture(),
  blobShadowTexture: () => new Texture()
}))
vi.mock('../../scene/monitor-texture', () => ({ monitorTexture: () => new Texture() }))

const THEME_IDS = ['samurai-empire', 'corporate-city', 'neo-edo-steam']
// One case per count and theme set: the whole 60-worker sweep alone sat near 5 s of CPU.
const CASES = [20, 40, 60].flatMap((count) =>
  [...THEME_IDS.map((theme) => [theme]), THEME_IDS].map((themes) => [count, themes] as const)
)

it.each(CASES)(
  'measures %i samurai workers with %j, real display meshes and decorative movers together',
  (count, themes) => {
    const { floor, agents } = agentsOn(count === 60 ? 10 : 4, count)
    const themeIdFor = companyThemes(themes)
    const floorTheme = getTheme(themes[0])
    expect(floorTheme.id).toBe(themes[0])
    const base = measure({ floor, agents, floorTheme, themeIdFor })
    const zoneGroups = groupZonesByTheme(floor, themeIdFor)
    const roomThemes = new Map(
      zoneGroups.flatMap((group) => group.rooms.map((room) => [room.id, group.themeId] as const))
    )
    const displays = buildWorkstationDisplays({
      floor,
      frame: makeFrame({
        floors: [floor],
        agents: [...agents],
        sessions: floor.rooms.flatMap((room) =>
          room.sessionKey ? [makeSession({ key: room.sessionKey })] : []
        )
      }),
      workstationForRoom: (id) => getTheme(roomThemes.get(id) ?? floorTheme.id).workstation
    })
    expect(displays).toHaveLength(count)
    const monitors = mergedDraws(createElement(WorkstationScreens, { displays }))
    expect(monitors.draws).toBe(count)
    expect(monitors.triangles).toBe(count * 2)
    const town = distributedTown(townOf(floor, null, 'full'), [floor])
    const movers = mergedDraws(
      createElement(MoverLayer, {
        floor,
        plan: town.plan,
        owners: town.owners,
        floorTheme,
        zoneGroups,
        player: null,
        isReducedMotion: true,
        hasVehicles: true
      })
    )
    const total = {
      ...base,
      draws: base.draws + monitors.draws + movers.draws,
      triangles: base.triangles + monitors.triangles + movers.triangles
    }
    const geometry = (floorTheme.playerGeometry ?? playerGeometry)(floorTheme.palette)
    const owner = mergedDraws(
      createElement(
        'mesh',
        { geometry },
        createElement('meshStandardMaterial', { vertexColors: true })
      )
    )
    total.draws += owner.draws
    total.triangles += owner.triangles
    geometry.dispose()
    report(`${themes.join(' + ')} ${count} incl. screens, movers and player`, total)
    expect(total.draws).toBeLessThanOrEqual(DRAW_CEILING)
    expect(total.triangles).toBeLessThanOrEqual(TRIANGLE_CEILING)
  }
)
