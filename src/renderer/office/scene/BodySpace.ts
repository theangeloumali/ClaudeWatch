import type { AgentView } from '../../../shared/office/types'
import { officePoses, withLivePose } from '../../office-live/pose-store'
import {
  WORKER_BODY_RADIUS,
  SUBAGENT_BODY_RADIUS,
  type BodyFootprint
} from '../../../shared/office/body-footprints'

// dry-new: the local sim and the two rendered mover layers need one set of occupied body positions.
export class SceneBodies {
  private readonly visitors = new Map<string, BodyFootprint>()
  private agents: readonly AgentView[] = []
  private placed = { agents: this.agents, version: -1, workers: [] as readonly BodyFootprint[] }

  setWorkers(agents: readonly AgentView[]): void {
    this.agents = agents
  }

  // Where workers stand now, so citizens and the player give way to a roamer's live pose (perf-2).
  get workers(): readonly BodyFootprint[] {
    const version = officePoses.version()
    if (this.placed.agents !== this.agents || this.placed.version !== version)
      this.placed = { agents: this.agents, version, workers: this.agents.map(footprintOf) }
    return this.placed.workers
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

// No agent rides a connector; the player's body carries its own through `set`.
function footprintOf(frameAgent: AgentView): BodyFootprint {
  const agent = withLivePose(frameAgent)
  return {
    id: agent.agentKey,
    x: agent.x,
    z: agent.z,
    elevation: agent.elevation ?? 0,
    radius: agent.isSubagent ? SUBAGENT_BODY_RADIUS : WORKER_BODY_RADIUS
  }
}
