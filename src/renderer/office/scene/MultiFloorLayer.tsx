import { useMemo, useRef } from 'react'
import type { AgentView } from '../../../shared/office/types'
import type { FloorGeometry } from '../scene-model'
import type { OfficeTheme } from '../themes/types'
import type { WallsMode } from '../logic/room-layout'
import {
  groupZonesByTheme,
  resolveTheme,
  type ThemeAssignments,
  type ThemeZoneGroup
} from '../logic/office-themes'
import { campusRoomColors } from '../logic/campus-colors'
import { campusGeometry } from '../logic/campus-geometry'
import { CAMPUS_THEME_ID, getTheme } from '../themes/registry'
import { NightCampusRoom } from '../themes/night-campus/NightCampusRoom'
import { UNKEYED_ROOM_COLORS } from '../themes/night-campus/palette'
import { BatchedScene } from './BatchedScene'
import { crewBatchRevision, type CitySpire } from './batch-revision'
import { FloorView } from './FloorView'
import { RobotCrew, type RobotMotion } from './Robot'
import { buildingKeyOf, floorElevation, partitionPhysicalAgents } from './all-floor-model'
import { ZonePickers, type SceneEditTarget } from './ZonePickers'
import { AUTHORED_WORKER_LIMIT } from './scene-density'
import { PhysicalBuildingShell } from './PhysicalBuildingShell'
import { TokenSpires } from './TokenSpire'

// Night Campus owns every zone and room, whatever was assigned to them in City.
function campusZoneGroups(floor: FloorGeometry): ThemeZoneGroup[] {
  const groups = groupZonesByTheme(floor, () => CAMPUS_THEME_ID)
  const merged: ThemeZoneGroup = {
    themeId: CAMPUS_THEME_ID,
    companies: groups.flatMap((group) => group.companies),
    projects: groups.flatMap((group) => group.projects),
    rooms: groups.flatMap((group) => group.rooms)
  }
  return merged.companies.length + merged.projects.length + merged.rooms.length > 0 ? [merged] : []
}

export function physicalZoneGroups(options: {
  floor: FloorGeometry
  assignments: ThemeAssignments
  theme: OfficeTheme
}): ThemeZoneGroup[] {
  if (options.theme.id === CAMPUS_THEME_ID) return campusZoneGroups(options.floor)
  const groups = groupZonesByTheme(options.floor, (zone) =>
    resolveTheme(zone, options.assignments, options.theme.id)
  )
  const byTheme = new Map<string, ThemeZoneGroup>(
    groups.map((group) => [group.themeId, { ...group, rooms: [] }])
  )
  for (const group of groups)
    for (const room of group.rooms) {
      const themeId =
        'themeId' in room && typeof room.themeId === 'string'
          ? getTheme(room.themeId).id
          : group.themeId
      const target = byTheme.get(themeId) ?? { themeId, companies: [], projects: [], rooms: [] }
      target.rooms.push(room)
      byTheme.set(themeId, target)
    }
  return [...byTheme.values()].filter(
    (group) => group.rooms.length + group.companies.length + group.projects.length > 0
  )
}

// dry-new: FloorView remains a single plate; this composition draws supplied storeys and presence.
export function MultiFloorLayer({
  floors,
  agents,
  floorTheme,
  groups,
  wallsMode,
  areRoofsVisible = true,
  isReducedMotion,
  selectedAgentKey,
  speakingAgentKey,
  onSelect,
  onFly,
  onFlyToZone,
  onWalk,
  onEditTarget,
  onFocusFloor,
  viewMode = 'office',
  focusedFloorId,
  focusedRoomId,
  spireStages
}: {
  floors: readonly FloorGeometry[]
  agents: readonly AgentView[]
  floorTheme: OfficeTheme
  groups: ReadonlyMap<string, readonly ThemeZoneGroup[]>
  wallsMode: WallsMode
  areRoofsVisible?: boolean
  isReducedMotion: boolean
  selectedAgentKey: string | null
  speakingAgentKey: string | null
  onSelect: (key: string | null) => void
  onFly: (key: string) => void
  onFlyToZone: (id: string) => void
  onWalk?: (point: { x: number; z: number }) => void
  onEditTarget?: (target: SceneEditTarget) => void
  onFocusFloor?: (floorId: string) => void
  viewMode?: 'city' | 'office'
  focusedFloorId?: string | null
  focusedRoomId?: string | null
  spireStages?: ReadonlyMap<string, number>
}) {
  const partition = useMemo(() => partitionPhysicalAgents(floors, agents), [floors, agents])
  const motions = useRef(new Map<string, RobotMotion>()).current
  const allGroups = useMemo(() => [...groups.values()].flat(), [groups])
  const buildings = useMemo(() => Map.groupBy(floors, buildingKeyOf), [floors])
  const themeOf = (buildingFloors: readonly FloorGeometry[]): OfficeTheme =>
    getTheme(groups.get(buildingFloors[0].floorId)?.[0]?.themeId ?? floorTheme.id)
  const spires: CitySpire[] = [...buildings].flatMap(([buildingId, buildingFloors]) => {
    const stage = spireStages?.get(buildingId) ?? 0
    return stage > 0 ? [{ buildingId, stage, theme: themeOf(buildingFloors) }] : []
  })
  // Campus rooms are open cutaways: no shell, no roof, each in its project's ring colour.
  const isCampus = floorTheme.id === CAMPUS_THEME_ID
  const roomColors = useMemo(() => {
    if (!isCampus) return null
    const geometry = campusGeometry(floors)
    const byProject = campusRoomColors(geometry.spokes)
    return new Map(
      geometry.spokes.map((spoke) => [
        spoke.buildingId,
        (spoke.projectKey && byProject.get(spoke.projectKey)) || UNKEYED_ROOM_COLORS
      ])
    )
  }, [isCampus, floors])
  const focused = floors.find((floor) => floor.floorId === focusedFloorId) ?? floors[0]
  // Opening roofs keeps storeys in place; explicit drill-down still clips higher floors.
  const isWithinDrillDown = (floor: FloorGeometry) =>
    viewMode !== 'office' ||
    buildingKeyOf(floor) !== (focused && buildingKeyOf(focused)) ||
    floorElevation(floor) <= floorElevation(focused ?? floor)
  const isOverview = agents.length > AUTHORED_WORKER_LIMIT
  const crewRevision = useMemo(
    () =>
      crewBatchRevision({
        agents,
        selectedAgentKey,
        themeId: floorTheme.id,
        zoneGroups: allGroups
      }),
    [agents, selectedAgentKey, floorTheme.id, allGroups]
  )
  const keys = new Set(agents.map((agent) => agent.agentKey))
  for (const key of motions.keys()) if (!keys.has(key)) motions.delete(key)
  const crewProps = {
    floorTheme,
    zoneGroups: allGroups,
    selectedAgentKey,
    speakingAgentKey,
    isReducedMotion,
    onSelect,
    onFly,
    motions,
    floors,
    isOverview
  }
  return (
    <>
      {!isCampus &&
        [...buildings].map(([buildingId, buildingFloors]) => (
          <PhysicalBuildingShell
            key={buildingId}
            floors={buildingFloors}
            theme={themeOf(buildingFloors)}
            focusedFloorId={viewMode === 'office' ? focused?.floorId : null}
            areRoofsVisible={areRoofsVisible}
            wallsMode={wallsMode}
            isOverview={isOverview}
            onFocusFloor={onFocusFloor}
            onEditTarget={onEditTarget}
          />
        ))}
      {floors.map((floor) => {
        const isInteriorVisible =
          isWithinDrillDown(floor) &&
          (isCampus ||
            !areRoofsVisible ||
            (viewMode === 'office' && floor.floorId === focused?.floorId))
        return (
          <group key={floor.floorId} visible={isInteriorVisible}>
            {roomColors && (
              <NightCampusRoom
                floor={floor}
                colors={roomColors.get(buildingKeyOf(floor)) ?? UNKEYED_ROOM_COLORS}
              />
            )}
            <FloorView
              openInteriors
              isOverview={isOverview}
              floor={floor}
              floorTheme={getTheme(groups.get(floor.floorId)?.[0]?.themeId ?? floorTheme.id)}
              zoneGroups={groups.get(floor.floorId) ?? []}
              wallsMode={wallsMode}
              isReducedMotion={isReducedMotion}
              focusedRoomId={floor.floorId === focusedFloorId ? focusedRoomId : null}
            />
            {isInteriorVisible && (
              <ZonePickers
                floor={floor}
                onFly={onFlyToZone}
                onMiss={() => onSelect(null)}
                onWalk={floorElevation(floor) === 0 ? onWalk : undefined}
                onEditTarget={onEditTarget}
                onFocusFloor={onFocusFloor}
              />
            )}
          </group>
        )
      })}
      {/* Robots batch apart: a roamer changing room rebuilds only them (perf-11). */}
      <BatchedScene revision={crewRevision}>
        {floors.map((floor) => (
          <group
            key={floor.floorId}
            name={`crew:${floor.floorId}`}
            visible={isWithinDrillDown(floor)}
          >
            <RobotCrew {...crewProps} agents={partition.byFloor.get(floor.floorId) ?? []} />
          </group>
        ))}
        {partition.transit.length > 0 && <RobotCrew {...crewProps} agents={partition.transit} />}
      </BatchedScene>
      {spires.length > 0 && (
        <TokenSpires spires={spires} floors={floors} palette={floorTheme.palette} />
      )}
    </>
  )
}
