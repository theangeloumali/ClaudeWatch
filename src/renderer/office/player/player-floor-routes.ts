import type { FloorWaypoint } from '../../../office/sim/world-floor-routes'
import type { Point } from '../../../office/sim/path'
import { streetPath } from '../../../office/sim/street-path'
import { entranceApproach } from '../../../shared/office/entrance-approach'
import { placeBody, PLAYER_BODY_RADIUS } from '../../../shared/office/body-footprints'
import type { FloorGeometry } from '../scene-model'
import { walkGround, walkPath } from './walk-ground'
import type { Player } from './walking'

// dry-new: camera floor selection is not a physical route; walking owns connector travel.
export function playerConnector(floor: FloorGeometry): Point {
  const connector = floor.connector ?? { x: floor.elevator.x, z: floor.elevator.z + 1.5 }
  const ground = walkGround(floor, [], floor)
  return (
    placeBody({
      body: { id: 'player-connector', ...connector, radius: PLAYER_BODY_RADIUS },
      obstacles: [],
      isOpen: ground.isOpen
    }) ?? connector
  )
}

function surfaceRoute(floor: FloorGeometry, from: Point, to: Point): FloorWaypoint[] {
  const route = walkPath(walkGround(floor, [], floor), from, to)
  return route.map((point) => ({
    ...point,
    elevation: floor.elevation ?? 0,
    physicalFloorId: floor.floorId
  }))
}

export function sendPlayerToFloor(
  player: Player,
  options: {
    fromFloor?: FloorGeometry
    toFloor: FloorGeometry
    destination?: Point
    allFloors?: readonly FloorGeometry[]
  }
): boolean {
  const { fromFloor, toFloor } = options
  if (!Number.isFinite(toFloor.elevation ?? 0) || player.path.some((point) => point.connectorId))
    return false
  if ((player.elevation ?? 0) !== 0 && !fromFloor) return false
  const target = options.destination ?? playerConnector(toFloor)
  const connector = playerConnector(toFloor)
  const route: FloorWaypoint[] = []
  if (player.physicalFloorId === toFloor.floorId)
    route.push(...surfaceRoute(toFloor, player.position, target))
  else {
    if (fromFloor && fromFloor.buildingId && fromFloor.buildingId === toFloor.buildingId) {
      const exit = surfaceRoute(fromFloor, player.position, playerConnector(fromFloor))
      const arrival = surfaceRoute(toFloor, connector, target)
      if (!exit.length || !arrival.length) return false
      route.push(
        ...exit,
        {
          ...connector,
          elevation: toFloor.elevation ?? 0,
          physicalFloorId: toFloor.floorId,
          connectorId: toFloor.buildingId
        },
        ...arrival
      )
      player.path = route
      player.goal = null
      player.held.clear()
      return true
    }
    if (fromFloor && player.physicalFloorId !== null) {
      const exit = surfaceRoute(fromFloor, player.position, playerConnector(fromFloor))
      if (!exit.length) return false
      route.push(...exit)
      if ((player.elevation ?? 0) !== 0)
        route.push({
          ...playerConnector(fromFloor),
          elevation: 0,
          physicalFloorId: null,
          connectorId: fromFloor.buildingId ?? fromFloor.floorId
        })
    } else
      route.push({ ...player.position, elevation: player.elevation ?? 0, physicalFloorId: null })
    const ground =
      (options.allFloors ?? []).find(
        (floor) => floor.buildingId === toFloor.buildingId && (floor.elevation ?? 0) === 0
      ) ?? toFloor
    const entrance = ground.entrance ?? playerConnector(ground)
    if (fromFloor && fromFloor.entrance) {
      const exitGround =
        (options.allFloors ?? []).find(
          (floor) => floor.buildingId === fromFloor.buildingId && (floor.elevation ?? 0) === 0
        ) ?? fromFloor
      route.push(...surfaceRoute(exitGround, playerConnector(exitGround), fromFloor.entrance), {
        ...entranceApproach(exitGround, fromFloor.entrance),
        elevation: 0,
        physicalFloorId: null
      })
    }
    const street = streetPath({
      from: route.at(-1) ?? player.position,
      to: ground.entrance ? entranceApproach(ground, entrance) : connector,
      blocks: [
        ...(options.allFloors?.[0]?.streetBlocks ?? []),
        ...(options.allFloors ?? [])
          .filter((floor) => (floor.elevation ?? 0) === 0)
          .flatMap((floor) => floor.zones)
      ]
    })
    if (!street.length) return false
    route.push(...street.map((point) => ({ ...point, elevation: 0, physicalFloorId: null })))
    if (ground.entrance) route.push(...surfaceRoute(ground, entrance, connector))
    if ((toFloor.elevation ?? 0) !== 0)
      route.push({
        ...connector,
        elevation: toFloor.elevation,
        physicalFloorId: toFloor.floorId,
        connectorId: toFloor.buildingId ?? toFloor.floorId
      })
    const arrival = surfaceRoute(toFloor, connector, target)
    if (!arrival.length) return false
    route.push(...arrival)
  }
  if (!route.length) return false
  player.path = route
  player.goal = null
  player.held.clear()
  player.onGoal?.()
  return true
}

export function travelPlayerToFloor(
  player: Player,
  targetFloor: FloorGeometry,
  allFloors: readonly FloorGeometry[]
): boolean {
  if (!allFloors.some((floor) => floor.floorId === targetFloor.floorId)) return false
  return sendPlayerToFloor(player, {
    fromFloor: allFloors.find((floor) => floor.floorId === player.physicalFloorId),
    toFloor: targetFloor,
    allFloors
  })
}
