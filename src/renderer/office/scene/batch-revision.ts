import type { AgentView } from '../../../shared/office/types'
import type { ThemeZoneGroup } from '../logic/office-themes'
import { physicalFloorId } from './all-floor-model'
import { AUTHORED_WORKER_LIMIT } from './scene-density'

// Which theme dresses which zones: a change re-themes the floor and the robots housed in it.
export function zoneThemesKey(zoneGroups: readonly ThemeZoneGroup[]) {
  return zoneGroups.map((group) => [
    group.themeId,
    [...group.companies, ...group.projects, ...group.rooms].map(({ id }) => id)
  ])
}

// What a crew's batch draws: each worker's model, theme and storey; a step changes none of it.
// A change of room or storey re-parents the robot, so its parts are new (perf-11).
export function crewBatchRevision(options: {
  agents: readonly AgentView[]
  selectedAgentKey: string | null
  themeId: string
  zoneGroups: readonly ThemeZoneGroup[]
}): string {
  const roster = options.agents.map(
    (agent) =>
      `${agent.agentKey}|${agent.provider}|${agent.isSubagent}|${agent.roomId}|${physicalFloorId(agent)}`
  )
  // A selection or a reply only adds a ring or a puff, drawn on its own (perf-3). In overview
  // the selected worker swaps its model (Robot.tsx), so there it still rebuilds.
  const modelSwapKey =
    options.agents.length > AUTHORED_WORKER_LIMIT ? options.selectedAgentKey : null
  return JSON.stringify([options.themeId, zoneThemesKey(options.zoneGroups), roster, modelSwapKey])
}
