import { createElement, isValidElement, type ReactNode } from 'react'
import { Texture } from 'three'
import { expect, it, vi } from 'vitest'
import { World } from '../../../../office/sim/world'
import { buildLayout } from '../../../../office/sim/layout'
import {
  createWorldDocument,
  validateWorldDocument
} from '../../../../shared/office/world-document'
import { resolveEffectiveWorld } from '../../../../office/sim/effective-world'
import { toFloorGeometry } from '../../../office-live/layout-geometry'
import { makeSession } from '../fixtures'
import { BatchedScene } from '../../scene/BatchedScene'
import { physicalZoneGroups, MultiFloorLayer } from '../../scene/MultiFloorLayer'
import { mergedDraws } from '../../themes/scene.test-utils'
import { getTheme } from '../../themes/registry'
import { EMPTY_THEME_ASSIGNMENTS } from '../../logic/office-themes'
import { groundEnvelope } from '../../scene/all-floor-model'
import { WorkstationScreens } from '../../scene/WorkstationScreens'
import { buildWorkstationDisplays } from '../../logic/workstation-displays'
import { MoverLayer } from '../../citizens/MoverLayer'
import { townOf } from '../../town/use-town-plan'
import { distributedTown } from '../../town/distributed-town'
import { VenueLayer } from '../../scene/VenueLayer'
import { visibleWorkstationDisplays } from '../../scene/scene-density'
import { playerCharacterGeometry } from '../../themes/character-geometry'
import { measure, DRAW_CEILING, TRIANGLE_CEILING } from '../../themes/live-budget.test-utils'

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
  useLayoutEffect: () => undefined,
  useEffect: () => undefined,
  memo: (component: unknown) => component,
  useRef: (current: unknown) => ({ current })
}))
vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined }))
vi.mock('@react-three/drei', () => ({ CameraControlsImpl: class {} }))
vi.mock('../../quality-store', () => ({
  useQualityChoice: () => ({ pin: 'full', chosen: 'full' })
}))
vi.mock('../../scene/monitor-texture', () => ({ monitorTexture: () => new Texture() }))
vi.mock('../../scene/textures', () => ({
  signTexture: () => new Texture(),
  blobShadowTexture: () => new Texture()
}))

it.each([20, 40, 60, 512])(
  'bounds %i real workers across three physical storeys with mixed themes',
  (count) => {
    const sessions = Array.from({ length: count }, (_, index) =>
      makeSession({
        key: `claude:${index}`,
        companyKey: `company:${index % (count > 60 ? 128 : 4)}`,
        projectKey: `project:${index % (count > 60 ? 128 : 4)}`
      })
    )
    const base = buildLayout(sessions, undefined)
    const document = createWorldDocument(base, sessions)
    document.buildings.forEach((building, index) => {
      building.floors = 3
      building.themeId = index % 2 ? 'corporate-city' : 'cyberpunk-city'
    })
    expect(validateWorldDocument(document, { layout: base, sessions })).toEqual([])
    const layout = resolveEffectiveWorld(base, document, sessions)
    const floors = toFloorGeometry(layout, sessions)
    const world = new World({ loungeTrips: false, resolveLayout: () => layout })
    world.apply({
      type: 'hello',
      v: 1,
      snapshot: { rev: 1, generatedAtMs: 1000, sessions, sources: [] }
    })
    const agents = world.step(0)
    const theme = getTheme('cyberpunk-city')
    const groups = new Map(
      floors.map((floor) => [
        floor.floorId,
        physicalZoneGroups({ floor, assignments: EMPTY_THEME_ASSIGNMENTS, theme })
      ])
    )
    const layer = MultiFloorLayer({
      floors,
      agents,
      floorTheme: theme,
      groups,
      wallsMode: 'cutaway',
      isReducedMotion: true,
      selectedAgentKey: null,
      speakingAgentKey: null,
      onSelect: () => undefined,
      onFly: () => undefined,
      onFlyToZone: () => undefined
    })
    // Robots batch apart at runtime (perf-11); counting their batch again keeps an upper bound.
    const crewBatch = [layer.props.children]
      .flat(2)
      .find(
        (child) => isValidElement<{ children: ReactNode }>(child) && child.type === BatchedScene
      )
    if (!isValidElement<{ children: ReactNode }>(crewBatch)) throw new Error('No crew batch')
    const layerDraws = mergedDraws(layer)
    const crewDraws = mergedDraws(crewBatch.props.children)
    const actual = {
      draws: layerDraws.draws + crewDraws.draws,
      triangles: layerDraws.triangles
    }
    // Retain the existing full-town envelope as a conservative fixed-layer allowance.
    const ground = groundEnvelope(
      floors.filter((floor) => floor.elevation === 0),
      floors[0]
    )
    const town = distributedTown(townOf(ground, null), [
      ...floors.filter((floor) => floor.elevation === 0),
      ...document.venues.map((venue) => venue.footprint)
    ])
    const fixed = measure({
      floor: { ...ground, rooms: [], zones: [] },
      agents: [],
      floorTheme: theme,
      themeIdFor: () => theme.id,
      town
    })
    const displays = floors.flatMap((floor) =>
      buildWorkstationDisplays({
        floor,
        frame: { floors, agents, sessions, sources: [], connected: true },
        workstationForRoom: () => theme.workstation
      })
    )
    const screens = mergedDraws(
      createElement(WorkstationScreens, { displays: visibleWorkstationDisplays(displays, null) })
    )
    const movers = mergedDraws(
      createElement(MoverLayer, {
        floor: ground,
        plan: town.plan,
        owners: town.owners,
        floorTheme: theme,
        zoneGroups: [...groups.values()].flat(),
        player: null,
        isReducedMotion: true,
        hasVehicles: true
      })
    )
    const venues = mergedDraws(
      VenueLayer({ venues: document.venues, palette: theme.palette }).props.children
    )
    const geometry = playerCharacterGeometry('courier', theme.palette)
    const player = mergedDraws(
      createElement(
        'mesh',
        { geometry },
        createElement('meshStandardMaterial', { vertexColors: true })
      )
    )
    geometry.dispose()
    const draws =
      actual.draws + fixed.draws + screens.draws + movers.draws + venues.draws + player.draws
    const triangles =
      actual.triangles +
      fixed.triangles +
      screens.triangles +
      movers.triangles +
      venues.triangles +
      player.triangles
    console.info(`Physical mixed scene ${count}: ${draws} draws, ${triangles} triangles`)
    expect(agents).toHaveLength(count)
    expect(floors).toHaveLength(count > 60 ? 384 : 12)
    expect(draws).toBeLessThanOrEqual(DRAW_CEILING)
    expect(triangles).toBeLessThanOrEqual(TRIANGLE_CEILING)
  },
  90_000
)
