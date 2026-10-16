import { useMemo } from 'react'
import type { AgentView, SessionRef, SourceHealth } from '../../../shared/office/types'
import type { FloorGeometry } from '../scene-model'
import type { OfficeTheme } from '../themes/types'
import { useThemeAssignments } from '../logic/office-themes'
import { buildOfficeLabels } from '../logic/office-labels'
import { buildWorkstationDisplays } from '../logic/workstation-displays'
import { getTheme } from '../themes/registry'
import { floorElevation, groundEnvelope, physicalFloorId } from './all-floor-model'
import { physicalZoneGroups } from './MultiFloorLayer'
import { AUTHORED_WORKER_LIMIT } from './scene-density'

// dry-new: one geometry revision and theme resolution serve every supplied physical storey.
export function useSceneFloorData(options: {
  floor: FloorGeometry
  visibleFloors?: readonly FloorGeometry[]
  allFloors?: readonly FloorGeometry[]
  theme: OfficeTheme
  agents: readonly AgentView[]
  sessions: readonly SessionRef[]
  sources?: readonly SourceHealth[]
  connected?: boolean
  selectedAgentKey: string | null
  speakingAgentKey: string | null
  areRoofsVisible?: boolean
  viewMode?: 'city' | 'office'
  focusedFloorId?: string | null
  focusedRoomId?: string | null
}) {
  const assignments = useThemeAssignments()
  const surfaces = useMemo(() => {
    if (!options.visibleFloors) return [options.floor]
    return [...new Map(options.visibleFloors.map((floor) => [floor.floorId, floor])).values()]
  }, [options.floor, options.visibleFloors])
  const groups = useMemo(
    () =>
      new Map(
        surfaces.map((floor) => [
          floor.floorId,
          physicalZoneGroups({ floor, assignments, theme: options.theme })
        ])
      ),
    [surfaces, assignments, options.theme]
  )
  const zoneGroups = useMemo(() => [...groups.values()].flat(), [groups])
  const townFloor = useMemo(
    () =>
      options.allFloors
        ? groundEnvelope(
            options.allFloors.filter((floor) => floorElevation(floor) === 0),
            options.floor
          )
        : options.visibleFloors
          ? groundEnvelope(surfaces, options.floor)
          : options.floor,
    [surfaces, options.floor, options.visibleFloors, options.allFloors]
  )
  const selectedRoomId =
    options.focusedRoomId ??
    options.agents.find((agent) => agent.agentKey === options.selectedAgentKey)?.roomId
  const officeLabels = useMemo(
    () =>
      surfaces.flatMap((floor) =>
        buildOfficeLabels(floor, selectedRoomId ? { roomId: selectedRoomId } : undefined).map(
          (label) => ({
            ...label,
            id: options.visibleFloors ? `${floor.floorId}:${label.id}` : label.id,
            y: label.y ?? floorElevation(floor) + 0.35
          })
        )
      ),
    [surfaces, selectedRoomId, options.visibleFloors]
  )
  const displays = useMemo(
    () =>
      surfaces.flatMap((floor) => {
        const themeByRoom = new Map(
          (groups.get(floor.floorId) ?? []).flatMap((group) =>
            group.rooms.map((room) => [room.id, group.themeId] as const)
          )
        )
        return buildWorkstationDisplays({
          floor,
          frame: {
            floors: [...surfaces],
            agents: [...options.agents],
            sessions: [...options.sessions],
            connected: options.connected ?? false,
            sources: [...(options.sources ?? [])]
          },
          workstationForRoom: (roomId) =>
            getTheme(themeByRoom.get(roomId) ?? options.theme.id).workstation
        }).map((display) => ({ ...display, y: display.y + floorElevation(floor) }))
      }),
    [
      surfaces,
      groups,
      options.agents,
      options.sessions,
      options.connected,
      options.sources,
      options.theme.id
    ]
  )
  const rosterKey = options.agents
    .map(
      (agent) =>
        `${agent.agentKey}|${agent.provider}|${agent.isSubagent}|${agent.roomId}|${physicalFloorId(agent)}`
    )
    .join(' ')
  // A selection or a reply only adds a ring or a puff, drawn on its own (perf-3). In overview
  // the selected worker swaps its model (Robot.tsx), so there it still rebuilds.
  const modelSwapKey =
    options.agents.length > AUTHORED_WORKER_LIMIT ? options.selectedAgentKey : null
  const revision = useMemo(
    () =>
      JSON.stringify([
        options.theme.id,
        surfaces,
        zoneGroups.map((group) => [
          group.themeId,
          [...group.companies, ...group.projects, ...group.rooms].map(({ id }) => id)
        ]),
        rosterKey,
        modelSwapKey,
        options.areRoofsVisible ?? true,
        options.viewMode,
        options.focusedFloorId,
        options.focusedRoomId
      ]),
    [
      options.theme.id,
      surfaces,
      zoneGroups,
      rosterKey,
      modelSwapKey,
      options.areRoofsVisible,
      options.viewMode,
      options.focusedFloorId,
      options.focusedRoomId
    ]
  )
  return { surfaces, groups, zoneGroups, townFloor, officeLabels, displays, revision }
}
