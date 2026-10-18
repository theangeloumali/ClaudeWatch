import { bodyFits, type BodyFootprint } from '../../shared/office/body-footprints'
import type { AgentView } from '../../shared/office/types'
import { agentBody } from './agent-body'
import { returnToDesk, tickAgent, type AgentRecord } from './behaviour'
import { deskOf, type FloorLayout } from './layout'
import { floorElevation } from './world-floor-routes'

// Seated at its desk once it is clear, or null while another body stands there.
export function seatAtDesk(
  agent: AgentRecord,
  floors: readonly FloorLayout[],
  obstacles: readonly BodyFootprint[]
): AgentRecord | null {
  const home = deskOf(floors, agent.view)
  if (!home) return null
  const { floor, desk } = home
  const recalled = returnToDesk(agent, desk.heading, [])
  const view = {
    ...recalled.view,
    x: desk.x,
    z: desk.z,
    elevation: floorElevation(floor),
    physicalFloorId: floor.id
  }
  if (!bodyFits(agentBody(view), obstacles)) return null
  return tickAgent({ ...recalled, view }, 0)
}

// A seat anywhere but the spot it faded on is a jump the renderer has to hide.
export const isSeatedElsewhere = (faded: AgentView, seated: AgentView): boolean =>
  faded.x !== seated.x ||
  faded.z !== seated.z ||
  (faded.elevation ?? 0) !== (seated.elevation ?? 0) ||
  faded.physicalFloorId !== seated.physicalFloorId
