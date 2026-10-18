import type { AgentView } from '../../../shared/office/types'
import {
  WORKER_BODY_RADIUS,
  SUBAGENT_BODY_RADIUS,
  type BodyFootprint
} from '../../../shared/office/body-footprints'

// dry-new: the local sim and the two rendered mover layers need one set of occupied body positions.
export class SceneBodies {
  workers: readonly BodyFootprint[] = []
  private readonly visitors = new Map<string, BodyFootprint>()

  setWorkers(agents: readonly AgentView[]): void {
    this.workers = agents.map((agent) => ({
      id: agent.agentKey,
      x: agent.x,
      z: agent.z,
      elevation: agent.elevation ?? 0,
      connectorId:
        'connectorId' in agent && typeof agent.connectorId === 'string'
          ? agent.connectorId
          : undefined,
      radius: agent.isSubagent ? SUBAGENT_BODY_RADIUS : WORKER_BODY_RADIUS
    }))
  }

  set(body: BodyFootprint): void {
    this.visitors.set(body.id, body)
  }
  remove(id: string): void {
    this.visitors.delete(id)
  }
  external(): BodyFootprint[] {
    return [...this.visitors.values()]
  }
  all(): BodyFootprint[] {
    return [...this.workers, ...this.visitors.values()]
  }
}
