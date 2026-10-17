import {
  SUBAGENT_BODY_RADIUS,
  WORKER_BODY_RADIUS,
  type BodyFootprint
} from '../../shared/office/body-footprints'
import type { AgentView } from '../../shared/office/types'

export function agentBody(view: AgentView): BodyFootprint {
  return {
    id: view.agentKey,
    x: view.x,
    z: view.z,
    elevation: view.elevation ?? 0,
    connectorId:
      'connectorId' in view && typeof view.connectorId === 'string' ? view.connectorId : undefined,
    radius: view.isSubagent ? SUBAGENT_BODY_RADIUS : WORKER_BODY_RADIUS
  }
}
