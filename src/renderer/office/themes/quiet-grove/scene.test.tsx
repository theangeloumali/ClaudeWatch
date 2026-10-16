import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Texture } from 'three'
import type { AgentView } from '../../../../shared/office/types'
import { makeAgent, makeSession } from '../../__tests__/fixtures'
import { agentsForFloor, layoutFloor } from '../../fixture/fixture-layout'
import { groupZonesByTheme, type ThemedZone } from '../../logic/office-themes'
import { FloorView } from '../../scene/FloorView'
import { RobotCrew } from '../../scene/Robot'
import { getTheme } from '../registry'
import { useRobotRig } from '../rig'
import { quietGrove } from './index'
import { everyElement, mergedDraws, type SceneElement } from '../scene.test-utils'

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => object) => factory(),
  useLayoutEffect: () => undefined,
  useRef: (current: object) => ({ current })
}))
vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined }))
vi.mock('../../scene/textures', () => ({
  signTexture: () => new Texture(),
  blobShadowTexture: () => new Texture()
}))

const DRAW_CEILING = 300
const ZONE_KIT_DRAW_BUDGET = 35
const EDO = 'neo-edo-steam'
const GROVE_ID = 'quiet-grove'

function twentyAgents(companyCount: number) {
  const sessions = Array.from({ length: 20 }, (_, index) =>
    makeSession({
      key: `claude:${index}`,
      provider: index % 2 ? 'codex' : 'claude',
      companyKey: `c_${index % companyCount}`,
      companyLabel: `Company ${index % companyCount}`,
      projectKey: `p_${index % companyCount}`,
      projectLabel: `Project ${index % companyCount}`
    })
  )
  const floor = layoutFloor({ sessions })
  return { floor, agents: agentsForFloor(floor, sessions) }
}

function measure(companyCount: number, floorThemeId: string, themeIds: readonly string[]) {
  const { floor, agents } = twentyAgents(companyCount)
  expect(agents).toHaveLength(20)
  const floorTheme = getTheme(floorThemeId)
  const zoneGroups = groupZonesByTheme(
    floor,
    (zone: ThemedZone) => themeIds[Number(zone.companyKey?.slice(2) ?? 0) % themeIds.length]
  )
  const kit = (groups: typeof zoneGroups) =>
    createElement(FloorView, {
      floor,
      floorTheme,
      zoneGroups: groups,
      wallsMode: 'cutaway',
      isReducedMotion: true
    })
  const crew = createElement(RobotCrew, {
    agents,
    zoneGroups,
    floorTheme,
    selectedAgentKey: agents[0].agentKey,
    speakingAgentKey: agents[0].agentKey,
    isReducedMotion: true,
    onSelect: () => undefined,
    onFly: () => undefined
  })
  const otherThemes = zoneGroups.filter((zoneGroup) => zoneGroup.themeId !== GROVE_ID)
  return {
    total: mergedDraws([kit(zoneGroups), crew]).draws,
    // What the grove's own zone parts add to a floor, robots and signs aside.
    groveKit: mergedDraws(kit(zoneGroups)).untextured - mergedDraws(kit(otherThemes)).untextured
  }
}

describe('Quiet Grove draw budget', () => {
  it('fits a 20-agent floor of its own inside the draw ceiling', () => {
    const result = measure(1, GROVE_ID, [GROVE_ID])
    console.info(`quiet grove alone: ${result.total} draws`)
    expect(result.total).toBeLessThanOrEqual(DRAW_CEILING)
  })

  it('fits four companies alternating Neo Edo Steam and Quiet Grove inside the ceiling', () => {
    const result = measure(4, EDO, [EDO, GROVE_ID])
    console.info(`edo + quiet grove: ${result.total} draws, grove zone kit ${result.groveKit}`)
    expect(result.total).toBeLessThanOrEqual(DRAW_CEILING)
    expect(result.groveKit).toBeLessThanOrEqual(ZONE_KIT_DRAW_BUDGET)
  })
})

describe('Quiet Grove spirit states', () => {
  const model = (overrides: Partial<AgentView>): SceneElement[] => {
    const agent = makeAgent({ agentKey: 'claude:state', ...overrides })
    return everyElement(
      createElement(quietGrove.robot.Model, {
        agent,
        skin: quietGrove.robot.skins[agent.provider],
        rosterIndex: 0,
        rig: useRobotRig(),
        isReducedMotion: true
      })
    )
  }
  // The raised lantern and the glowing ground under the figure: the second still reads from
  // straight above and at the floor zoom.
  const signals = (overrides: Partial<AgentView>) =>
    ['needs-you-beacon', 'needs-you-halo'].map(
      (name) => model(overrides).find((element) => element.props.name === name)?.props.visible
    )

  it.each(['permission', 'question'] as const)('lights both signals for %s', (attention) => {
    expect(signals({ attention })).toEqual([true, true])
    expect(signals({ attention, isSubagent: true })).toEqual([true, true])
  })

  it.each(['none', 'done', 'error', 'limited'] as const)('hides both for %s', (attention) => {
    expect(signals({ attention, activity: 'editing' })).toEqual([false, false])
  })

  // Transparent parts never merge: three per agent would cost 60 draws on a full floor.
  it('draws its fireflies and thought dots as opaque parts that merge', () => {
    const materials = model({}).filter((element) => element.type === 'meshStandardMaterial')
    expect(materials.length).toBeGreaterThan(10)
    for (const material of materials) expect(material.props.transparent).toBeFalsy()
  })
})
