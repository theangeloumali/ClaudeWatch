import { useCallback, useRef, type Dispatch } from 'react'
import type { OfficeAction } from '../logic/office-reducer'
import { findZone } from '../logic/zone-model'
import type { FloorGeometry } from '../scene-model'
import { createPlayer } from './walking'
import type { Player } from './walking'
import { playerConnector } from './player-floor-routes'

// The owner's player for the floor on show. It is made at the gate when the Office opens and
// lives only in this page: the bridge never hears of it, so a view-only page has one too.
export function useWalking({
  floor,
  dispatch,
  allFloors
}: {
  floor: FloorGeometry | undefined
  dispatch: Dispatch<OfficeAction>
  allFloors?: readonly FloorGeometry[]
}) {
  const playerRef = useRef<Player | null>(null)
  if (!playerRef.current && floor) {
    playerRef.current = createPlayer(allFloors ? playerConnector(floor) : floor.elevator)
    playerRef.current.elevation = 0
    playerRef.current.physicalFloorId = (floor.elevation ?? 0) === 0 ? floor.floorId : null
  }
  const player = playerRef.current
  // Sidebar navigation is an explicit camera action, not a delayed player walk.
  const goToZone = useCallback(
    (zoneId: string) => {
      const floors = allFloors ?? (floor ? [floor] : [])
      const destinationFloor = floors.find((candidate) => findZone(candidate, zoneId))
      if (destinationFloor)
        dispatch({ type: 'floor-flown', floorId: destinationFloor.floorId, zoneId })
    },
    [floor, dispatch, allFloors]
  )
  return { player, goToZone }
}
