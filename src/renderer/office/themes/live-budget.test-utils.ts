import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { expect } from 'vitest'
import type { AgentView } from '../../../shared/office/types'
import { makeSession } from '../__tests__/fixtures'
import { agentsForFloor, layoutFloor } from '../fixture/fixture-layout'
import { groupZonesByTheme, type ThemedZone } from '../logic/office-themes'
import type { FloorGeometry } from '../scene-model'
import { FloorView } from '../scene/FloorView'
import { Horizon } from '../scene/Horizon'
import { RobotCrew } from '../scene/Robot'
import { BatchedScene } from '../scene/BatchedScene'
import { TowerView } from '../scene/WorldView'
import { groundBuffers, groundQuads } from '../town/town-ground'
import { dressOf, TownAmbient, TownView } from '../town/TownView'
import type { TownSize } from '../town/town-grid'
import { townOf, type Town } from '../town/use-town-plan'
import { getTheme, listThemes } from './registry'
import { mergedDraws, type DrawCount } from './scene.test-utils'
import { GROUND_Y } from './surroundings'
import type { OfficeTheme } from './types'

export const DRAW_CEILING = 300
export const TRIANGLE_CEILING = 600_000
// What a theme may add for its surroundings, lounge and ambient life together.
export const ADDED_DRAWS_PER_THEME = 9
export const EDO = 'neo-edo-steam'
export const BRASS = 'brass-workshop'
// The shipped themes, listed before any test stand-in is registered.
export const REAL_THEMES = listThemes()

export interface Composition {
  town?: Town
  floor: FloorGeometry
  agents: readonly AgentView[]
  floorTheme: OfficeTheme
  themeIdFor: (zone: ThemedZone) => string
  // Today's full town unless a size is named.
  townSize?: TownSize
}

// Each BatchedScene under a layer merges on its own at runtime, so each is counted on its own.
function batchDraws(layer: ReactNode): DrawCount {
  const batches = (node: ReactNode): ReactElement<{ children?: ReactNode }>[] => {
    if (Array.isArray(node)) return node.flatMap(batches)
    if (!isValidElement<{ children?: ReactNode }>(node)) return []
    return node.type === BatchedScene ? [node] : batches(node.props.children)
  }
  return batches(layer)
    .map((batch) => mergedDraws(batch.props.children))
    .reduce(
      (sum, each) => ({
        draws: sum.draws + each.draws,
        untextured: sum.untextured + each.untextured,
        triangles: sum.triangles + each.triangles
      }),
      { draws: 0, untextured: 0, triangles: 0 }
    )
}

// An upper bound: every thought dot and steam puff at once, and the world at building zoom.
export function measure({
  floor,
  agents,
  floorTheme,
  themeIdFor,
  townSize,
  town: suppliedTown
}: Composition) {
  const zoneGroups = groupZonesByTheme(floor, themeIdFor)
  // Each layer merges on its own, as its own BatchedScene does at runtime.
  const focused = mergedDraws([
    createElement(FloorView, {
      floor,
      floorTheme,
      zoneGroups,
      wallsMode: 'cutaway',
      isReducedMotion: true
    }),
    createElement(RobotCrew, {
      agents,
      zoneGroups,
      floorTheme,
      selectedAgentKey: agents[0]?.agentKey ?? null,
      speakingAgentKey: agents[0]?.agentKey ?? null,
      isReducedMotion: true,
      onSelect: () => undefined,
      onFly: () => undefined
    })
  ])
  // The town of a first start at full detail: the most there is to draw.
  const town = suppliedTown ?? townOf(floor, null, 'full', townSize)
  const world = batchDraws(
    TowerView({
      plan: town.plan,
      theme: floorTheme,
      band: 'building',
      floors: [
        { floorId: floor.floorId, label: floor.label, agentCount: agents.length, attentionCount: 2 }
      ]
    })
  )
  const horizon = mergedDraws(
    createElement(Horizon, {
      box: { ...town.plan.extent, minY: GROUND_Y, maxY: 1 },
      color: floorTheme.palette.stone
    })
  )
  // TownGround is one mesh by construction (town/town-view.test.tsx holds that).
  const ground = groundBuffers(groundQuads(town.plan, dressOf(floorTheme)))
  const shared = { town, floor, floorTheme, zoneGroups }
  // What a size change costs the town's batch: its elements built and merged once.
  const rebuildStart = performance.now()
  const buildings = batchDraws(TownView(shared))
  const townRebuildMs = performance.now() - rebuildStart
  const ambient = batchDraws(TownAmbient({ ...shared, share: 1, isReducedMotion: true }))
  const townDraws = 1 + buildings.draws
  return {
    themeCount: zoneGroups.length,
    lotCount: town.plan.lots.length + town.green.length,
    roadCount: town.plan.roads.length,
    townRebuildMs,
    focusedDraws: focused.draws,
    worldDraws: world.draws,
    horizonDraws: horizon.draws,
    // The ground, the town's lots and the belt: shared by every theme on the floor.
    townDraws,
    // What the themes add of their own around the offices: their ambient life.
    surroundingsDraws: ambient.draws,
    draws: focused.draws + world.draws + horizon.draws + townDraws + ambient.draws,
    triangles:
      focused.triangles +
      world.triangles +
      horizon.triangles +
      ground.positions.length / 9 +
      buildings.triangles +
      ambient.triangles
  }
}

export function agentsOn(
  companyCount: number,
  agentCount = 20
): Pick<Composition, 'floor' | 'agents'> {
  const sessions = Array.from({ length: agentCount }, (_, i) =>
    makeSession({
      key: `claude:${i}`,
      provider: i % 2 ? 'codex' : 'claude',
      companyKey: `c_${i % companyCount}`,
      companyLabel: `Company ${i % companyCount}`,
      projectKey: `p_${i % companyCount}`,
      projectLabel: `Project ${i % companyCount}`
    })
  )
  const floor = layoutFloor({ sessions })
  const agents = agentsForFloor(floor, sessions)
  expect(agents).toHaveLength(agentCount)
  return { floor, agents }
}

export function report(name: string, result: ReturnType<typeof measure>): void {
  console.info(
    `${name}: ${result.draws} draw calls (${result.worldDraws} tower, ${result.townDraws} town on ${result.lotCount} lots, ${result.surroundingsDraws} ambient), ${result.triangles} triangles`
  )
}

export const companyThemes =
  (themeIds: readonly string[]) =>
  (zone: ThemedZone): string =>
    themeIds[Number(zone.companyKey?.slice(2) ?? 0) % themeIds.length]

export const THREE_THEMES = [EDO, 'violet-court', 'orbital-garrison']

export function scaled(themeIds: readonly string[], agentCount: number, companyCount: number) {
  const result = measure({
    ...agentsOn(companyCount, agentCount),
    floorTheme: getTheme(themeIds[0]),
    themeIdFor: companyThemes(themeIds)
  })
  report(`${themeIds.join(' + ')}, ${companyCount} companies, ${agentCount} agents`, result)
  return result
}
