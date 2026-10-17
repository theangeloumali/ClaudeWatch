import { bodyFits, type BodyFootprint } from '../../shared/office/body-footprints'
import { agentBody } from './agent-body'
import { WALK_METRES_PER_SECOND, tickAgent, type AgentRecord } from './behaviour'
import type { FloorLayout } from './layout'
import { remainingRouteMetres } from './movement-recovery'
import type { Point } from './path'
import { floorElevation } from './world-floor-routes'

// Work seats an agent within 20 s of calling it home (FOUND 7); the 2 s past this walk leave
// room for a yield at its door.
const RECALL_WALK_METRES = 18 * WALK_METRES_PER_SECOND

// Whether work calling it home walks it; out in town, a walk too long for the call fades it
// to its desk instead.
export const walksHome = (agent: AgentRecord, route: readonly Point[]): boolean =>
  agent.view.physicalFloorId !== null ||
  (route.length > 0 && remainingRouteMetres(agent.view, route) <= RECALL_WALK_METRES)

// At or bound for an outing, fading home from one, or walking home from one too far to make
// work's call in time.
export const isAwayForLeisure = (
  agent: AgentRecord,
  isFinished: boolean,
  isFading: boolean
): boolean =>
  agent.state !== 'leaving' &&
  (agent.view.place === 'lounge' ||
    isFading ||
    (!isFinished &&
      agent.isReturningFromLeisure === true &&
      agent.path.length > 0 &&
      !walksHome(agent, agent.path)))

// Seated at its desk once it is clear, or null while another body stands there.
export function seatAtDesk(
  agent: AgentRecord,
  floors: readonly FloorLayout[],
  obstacles: readonly BodyFootprint[]
): AgentRecord | null {
  const floor = floors.find((candidate) => candidate.id === agent.view.floorId)
  const desk = floor?.rooms
    .find((room) => room.id === agent.view.roomId)
    ?.slots.find((slot) => slot.id === agent.view.slotId)
  if (!floor || !desk) return null
  const view = {
    ...agent.view,
    x: desk.x,
    z: desk.z,
    elevation: floorElevation(floor),
    physicalFloorId: floor.id,
    connectorId: undefined
  }
  if (!bodyFits(agentBody(view), obstacles)) return null
  return tickAgent({ ...agent, state: 'arriving', view, path: [], slotHeading: desk.heading }, 0)
}
