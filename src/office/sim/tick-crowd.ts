import type { BodyFootprint } from '../../shared/office/body-footprints'
import { agentBody } from './agent-body'
import type { AgentRecord } from './behaviour'
import type { Point } from './path'

export interface Walker {
  body: BodyFootprint
  to: Point
}

function walkerOf(agent: AgentRecord): Walker | undefined {
  const to = agent.path.find(
    (point) => Math.hypot(point.x - agent.view.x, point.z - agent.view.z) > 1e-8
  )
  return to && { body: agentBody(agent.view), to }
}

// One tick's bodies and walkers, built once and kept current as each agent moves. Order is
// agent order, as it was when every mover rebuilt them: a queue takes the first leader it finds.
export class TickCrowd {
  readonly bodies: BodyFootprint[]
  readonly walkers: Walker[]
  // Each agent's place in `bodies`; walkers keep the same relative order.
  private readonly ranks: Map<string, number>

  constructor(agents: readonly AgentRecord[], obstacles: readonly BodyFootprint[]) {
    this.ranks = new Map(agents.map((agent, rank) => [agent.view.agentKey, rank]))
    this.bodies = [...agents.map((agent) => agentBody(agent.view)), ...obstacles]
    this.walkers = agents.flatMap((agent) => walkerOf(agent) ?? [])
  }

  // Records where the agent now stands and walks to, and hands the agent back.
  updated(agent: AgentRecord): AgentRecord {
    const key = agent.view.agentKey
    const rank = this.ranks.get(key)
    if (rank === undefined) return agent
    this.bodies[rank] = agentBody(agent.view)
    const walker = walkerOf(agent)
    const at = this.walkers.findIndex((other) => other.body.id === key)
    if (at >= 0) {
      if (walker) this.walkers[at] = walker
      else this.walkers.splice(at, 1)
    } else if (walker) {
      const next = this.walkers.findIndex((other) => this.ranks.get(other.body.id)! > rank)
      this.walkers.splice(next < 0 ? this.walkers.length : next, 0, walker)
    }
    return agent
  }

  remove(key: string): void {
    const rank = this.ranks.get(key)
    if (rank === undefined) return
    this.ranks.delete(key)
    this.bodies.splice(rank, 1)
    for (const [other, later] of this.ranks) if (later > rank) this.ranks.set(other, later - 1)
    const at = this.walkers.findIndex((walker) => walker.body.id === key)
    if (at >= 0) this.walkers.splice(at, 1)
  }
}
