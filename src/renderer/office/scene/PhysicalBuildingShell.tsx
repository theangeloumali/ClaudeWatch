import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, type Group } from 'three'
import type { FloorGeometry } from '../scene-model'
import type { OfficeTheme } from '../themes/types'
import { doorSide, SIDE_NORMAL, type WallsMode } from '../logic/room-layout'
import { createSideCutaway } from '../logic/facade-cutaway'
import { box, Parts } from '../themes/parts'
import {
  buildingCrown,
  buildingEntrance,
  buildingExteriorProfile,
  crownAnchor
} from '../themes/physical-building-parts'
import { buildingPlaces, crownTopOf } from '../logic/building-place'
import { floorElevation, PHYSICAL_STOREY_HEIGHT } from './all-floor-model'
import { BuildingWindows } from './BuildingWindows'
import { OperationalStructure } from './OperationalStructure'
import { TokenSpire } from './TokenSpire'
import { editSceneTarget, isStillClick, trackPress, type SceneEditTarget } from './ZonePickers'

// dry-new: theme landmarks invent storeys; this shell encloses only supplied physical floors.
export function PhysicalBuildingShell({
  floors,
  theme,
  focusedFloorId,
  areRoofsVisible = true,
  wallsMode = 'cutaway',
  isOverview = false,
  onFocusFloor,
  onEditTarget
}: {
  floors: readonly FloorGeometry[]
  theme: OfficeTheme
  focusedFloorId?: string | null
  areRoofsVisible?: boolean
  wallsMode?: WallsMode
  isOverview?: boolean
  onFocusFloor?: (floorId: string) => void
  onEditTarget?: (target: SceneEditTarget) => void
}) {
  const ordered = useMemo(
    () => [...floors].sort((left, right) => floorElevation(left) - floorElevation(right)),
    [floors]
  )
  const ground = ordered[0]
  const top = ordered.at(-1)
  const focused = ordered.find((floor) => floor.floorId === focusedFloorId)
  const profile = useMemo(
    () => (ground ? buildingExteriorProfile({ floor: ground, theme }) : undefined),
    [ground, theme]
  )
  const crown = useMemo(
    () => (top ? buildingCrown({ floor: top, theme, profile }) : []),
    [top, theme, profile]
  )
  const entranceParts = useMemo(
    () => (profile ? buildingEntrance({ theme, profile }) : { facade: [], roof: [] }),
    [theme, profile]
  )
  const roofSlabs = useMemo(
    () =>
      ordered
        .filter((floor) => !focused || floorElevation(floor) < floorElevation(focused))
        .map((floor) =>
          box(
            [floor.x, floorElevation(floor) + PHYSICAL_STOREY_HEIGHT - 0.12, floor.z],
            [floor.width, 0.24, floor.depth],
            theme.palette.stone
          )
        ),
    [ordered, focused, theme.palette.stone]
  )
  const buildingId = ground?.buildingId ?? ground?.floorId ?? ''
  const isCrownShown = areRoofsVisible && !focused
  const roof = useMemo(
    () => (isCrownShown ? crownTopOf(ordered, theme) : null),
    [isCrownShown, ordered, theme]
  )
  const deck = useMemo(() => (top ? crownAnchor(top) : null), [top])
  // A ref with a cleanup, not an effect: marks lose the roof the moment the shell goes.
  const feedRoof = useMemo(
    () => () => {
      buildingPlaces.setRoof(buildingId, roof)
      return () => buildingPlaces.setRoof(buildingId, null)
    },
    [buildingId, roof]
  )
  const entranceFacade = useRef<Group>(null)
  const forward = useMemo(() => new Vector3(), [])
  const cutaway = useMemo(() => createSideCutaway<'entrance'>(), [])
  const entrance = ground?.entrance ?? {
    x: ground?.x ?? 0,
    z: (ground?.z ?? 0) + (ground?.depth ?? 0) / 2
  }
  const entranceNormal = SIDE_NORMAL[ground ? doorSide({ ...ground, door: entrance }) : 'south']
  const entranceHeading = Math.atan2(entranceNormal.x, entranceNormal.z)
  useFrame(({ camera }) => {
    if (!entranceFacade.current) return
    const isNear = cutaway.isOpen('entrance', camera.getWorldDirection(forward), entranceNormal)
    const isOpen = focused === ground || !areRoofsVisible
    entranceFacade.current.visible =
      !isOpen || wallsMode === 'up' || (wallsMode === 'cutaway' && !isNear)
  })
  if (!ground || !top) return null
  return (
    <group
      ref={feedRoof}
      name={`physical-building:${buildingId}`}
      onPointerDown={trackPress}
      onContextMenu={(event) =>
        editSceneTarget(event, {
          kind: 'building',
          id: ground.buildingId ?? ground.floorId,
          onEditTarget
        })
      }
    >
      {areRoofsVisible && (
        <group name={`physical-roof:${ground.buildingId ?? ground.floorId}`}>
          {!focused && <Parts parts={crown} />}
          {roof && deck && (
            <TokenSpire buildingId={buildingId} deck={deck} roof={roof} theme={theme} />
          )}
          {!focused && (
            <group
              position={[entrance.x, floorElevation(ground), entrance.z]}
              rotation={[0, entranceHeading, 0]}
            >
              <Parts parts={entranceParts.roof} />
            </group>
          )}
          <Parts parts={roofSlabs} />
        </group>
      )}
      {ordered
        .filter((floor) => !focused || floorElevation(floor) <= floorElevation(focused))
        .map((floor) => {
          const isOpen = floor === focused || !areRoofsVisible
          return (
            <group
              key={floor.floorId}
              visible={!focused || floorElevation(floor) <= floorElevation(focused)}
            >
              <BuildingWindows
                floor={floor}
                palette={theme.palette}
                isOverview={isOverview}
                wallsMode={isOpen ? wallsMode : 'up'}
                presentation="exterior"
                exteriorProfile={profile}
              />
              {profile && (
                <OperationalStructure
                  floor={floor}
                  theme={theme}
                  profile={profile}
                  wallsMode={isOpen ? wallsMode : 'up'}
                  isOverview={isOverview}
                />
              )}
              {!isOpen && (
                <mesh
                  position={[floor.x, floorElevation(floor) + PHYSICAL_STOREY_HEIGHT / 2, floor.z]}
                  scale={[floor.width, PHYSICAL_STOREY_HEIGHT, floor.depth]}
                  onPointerDown={(event) => {
                    if (event.button === 0) trackPress(event)
                  }}
                  onClick={(event) => {
                    if (event.button !== 0 || !isStillClick(event)) return
                    event.stopPropagation()
                    onFocusFloor?.(floor.floorId)
                  }}
                >
                  <boxGeometry args={[1, 1, 1]} />
                  <meshBasicMaterial visible={false} />
                </mesh>
              )}
            </group>
          )
        })}
      <group
        ref={entranceFacade}
        name={`physical-entrance-facade:${ground.floorId}`}
        visible={(areRoofsVisible && focused !== ground) || wallsMode === 'up'}
        position={[entrance.x, floorElevation(ground), entrance.z]}
        rotation={[0, entranceHeading, 0]}
      >
        <Parts parts={entranceParts.facade} />
      </group>
    </group>
  )
}
