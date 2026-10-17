import { bodyFits, type BodyFootprint } from '../../shared/office/body-footprints'
import { agentBody } from './agent-body'
import { tickAgent, type AgentRecord } from './behaviour'
import type { FloorLayout } from './layout'
import { floorElevation } from './world-floor-routes'

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
    physicalFloorId: floor.id
  }
  if (!bodyFits(agentBody(view), obstacles)) return null
  return tickAgent({ ...agent, state: 'arriving', view, path: [], slotHeading: desk.heading }, 0)
}
