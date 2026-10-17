import { useMemo, type ReactNode } from 'react'
import { FURNITURE_SCALE, GUEST_FURNITURE_SCALE } from '../../../shared/office/figure-scale'
import type { ThemeZoneGroup } from '../logic/office-themes'
import { ROOM_DOOR_WIDTH, type WallsMode } from '../logic/room-layout'
import { plateLocalFloor } from '../logic/zone-framing'
import type { FloorGeometry, LoungeGeometry } from '../scene-model'
import { getTheme } from '../themes/registry'
import { beanbagParts } from '../themes/game-corner'
import { GameCorner } from '../themes/GameCorner'
import { Parts } from '../themes/parts'
import type { OfficeTheme } from '../themes/types'
import { floorConnector, floorElevation } from './all-floor-model'
import { CutawaySlab } from './CutawaySlab'
import { OverviewDesk } from './OverviewDesk'
import { OverviewStructure } from './OverviewStructure'
import { OperationalRoomBoundary } from './OperationalStructure'

// Themes model furniture for agents at their old size. Drawing it in a group scaled about a
// fixed point enlarges it for today's agents without moving that point or touching a theme.
function scaledAbout(
  point: { x: number; z: number },
  scale: number,
  key: string,
  furniture: ReactNode
) {
  return (
    <group key={key} position={[point.x, 0, point.z]} scale={scale}>
      <group position={[-point.x, 0, -point.z]}>{furniture}</group>
    </group>
  )
}

// The sim's lounge shrunk about its centre to the size its theme draws. Drawn in a group scaled
// back up about that centre, every stool lands on one of the sim's seats.
export function loungeAsDrawn(lounge: LoungeGeometry): LoungeGeometry {
  const shrunk = (point: { x: number; z: number }) => ({
    x: lounge.x + (point.x - lounge.x) / FURNITURE_SCALE,
    z: lounge.z + (point.z - lounge.z) / FURNITURE_SCALE
  })
  return {
    ...lounge,
    width: lounge.width / FURNITURE_SCALE,
    depth: lounge.depth / FURNITURE_SCALE,
    door: shrunk(lounge.door),
    seats: lounge.seats.map((seat) => ({ ...seat, ...shrunk(seat) }))
  }
}

// One slab and one lift from the floor's theme; every zone is drawn by the theme it resolved to.
export function FloorView({
  floor,
  floorTheme,
  zoneGroups,
  wallsMode,
  isReducedMotion,
  openInteriors = false,
  isOverview = false,
  focusedRoomId = null
}: {
  floor: FloorGeometry
  floorTheme: OfficeTheme
  zoneGroups: readonly ThemeZoneGroup[]
  wallsMode: WallsMode
  isReducedMotion: boolean
  openInteriors?: boolean
  isOverview?: boolean
  focusedRoomId?: string | null
}) {
  const { Slab, Elevator } = floorTheme.kit.floor
  const isOpenCeiling = openInteriors
  // The slab and the lift draw around their own origin: they go at the plate centre, with the
  // floor measured from there. Zones are in the sim's coordinates and stay outside the group.
  const plate = useMemo(
    () => plateLocalFloor({ ...floor, elevator: floorConnector(floor) }),
    [floor]
  )
  // The scene re-renders for every step an agent takes; nothing here changes then, and handing
  // React the same elements lets it skip the whole floor.
  return useMemo(
    () => (
      <group position={[0, floorElevation(floor), 0]}>
        <group position={[floor.x, 0, floor.z]}>
          {isOpenCeiling ? (
            <CutawaySlab floor={plate} palette={floorTheme.palette} />
          ) : (
            !isOverview && <Slab floor={plate} />
          )}
          {isOverview ? (
            <OverviewStructure
              floor={plate}
              palette={floorTheme.palette}
              foundation={!isOpenCeiling}
            />
          ) : (
            <Elevator floor={plate} />
          )}
        </group>
        {zoneGroups.map((zoneGroup) => {
          const zoneTheme = getTheme(zoneGroup.themeId)
          const kit = zoneTheme.kit.zone
          return (
            <group key={zoneGroup.themeId}>
              {zoneGroup.companies.map((company) => (
                <group key={company.id}>
                  {!isOpenCeiling && !isOverview && <kit.CompanyZone zone={company} />}
                  {company.lounge &&
                    (isOverview ? (
                      <group name="overview-lounge">
                        {company.lounge.seats.map((seat, index) => (
                          <group
                            key={seat.slotId}
                            name="lounge-seat"
                            position={[seat.x, 0, seat.z]}
                            rotation={[0, seat.heading, 0]}
                            scale={FURNITURE_SCALE}
                          >
                            <Parts parts={beanbagParts(zoneTheme.palette, index)} />
                          </group>
                        ))}
                      </group>
                    ) : (
                      scaledAbout(
                        company.lounge,
                        FURNITURE_SCALE,
                        company.lounge.id,
                        <GameCorner
                          lounge={loungeAsDrawn(company.lounge)}
                          palette={zoneTheme.palette}
                        />
                      )
                    ))}
                </group>
              ))}
              {!isOpenCeiling &&
                !isOverview &&
                zoneGroup.projects.map((project) => (
                  <kit.ProjectOffice key={project.id} zone={project} />
                ))}
              {!isOpenCeiling && !isOverview && <kit.RoomFloors rooms={zoneGroup.rooms} />}
              <kit.Walls
                rooms={zoneGroup.rooms}
                mode={wallsMode}
                isReducedMotion={isReducedMotion}
              />
              {zoneGroup.rooms.map((room) => (
                <group key={room.id}>
                  <OperationalRoomBoundary
                    room={room}
                    theme={zoneTheme}
                    focusedRoomId={focusedRoomId}
                    isOverview={isOverview}
                    openInteriors={isOpenCeiling}
                  />
                  {!isOverview && (
                    <>
                      {scaledAbout(
                        room.door,
                        ROOM_DOOR_WIDTH / 1.1,
                        `${room.id}:door`,
                        <kit.Doorway room={room} />
                      )}
                      <kit.RoomSign room={room} />
                      <kit.RoomDressing room={room} />
                    </>
                  )}
                  {room.seats.map((slot) =>
                    // The seat is the sim's and stays put; a lead's desk grows more than a guest's.
                    scaledAbout(
                      slot,
                      slot.slotId === 'desk_main' ? FURNITURE_SCALE : GUEST_FURNITURE_SCALE,
                      slot.slotId,
                      isOverview ? (
                        <OverviewDesk slot={slot} palette={zoneTheme.palette} />
                      ) : (
                        <kit.Desk room={room} slot={slot} />
                      )
                    )
                  )}
                </group>
              ))}
            </group>
          )
        })}
      </group>
    ),
    [
      floor,
      plate,
      Slab,
      Elevator,
      zoneGroups,
      wallsMode,
      isReducedMotion,
      isOpenCeiling,
      floorTheme.palette,
      isOverview,
      focusedRoomId
    ]
  )
}
