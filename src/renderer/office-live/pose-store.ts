import type { AgentView } from '../../shared/office/types'

// Where an agent stands this sim step. Motion lives here, outside React (perf-2).
export interface AgentPose {
  x: number
  z: number
  heading: number
  elevation: number
}

export interface PoseStore {
  write(key: string, pose: AgentPose): void
  read(key: string): AgentPose | undefined
  // Counts the writes that moved a pose, so a reader can tell when anything walked.
  version(): number
  retain(keys: ReadonlySet<string>): void
}

const isSamePose = (a: AgentPose, b: AgentPose): boolean =>
  a.x === b.x && a.z === b.z && a.heading === b.heading && a.elevation === b.elevation

export function createPoseStore(): PoseStore {
  const poses = new Map<string, AgentPose>()
  let moves = 0
  return {
    write(key, pose) {
      const previous = poses.get(key)
      if (previous && isSamePose(previous, pose)) return
      poses.set(key, pose)
      moves++
    },
    read: (key) => poses.get(key),
    version: () => moves,
    retain(keys) {
      for (const key of poses.keys()) if (!keys.has(key)) poses.delete(key)
    }
  }
}

export const poseOf = (agent: AgentView): AgentPose => ({
  x: agent.x,
  z: agent.z,
  heading: agent.heading,
  elevation: agent.elevation ?? 0
})

// The live pose where the store has one, else the one the frame carried.
export const livePose = (poses: PoseStore, agent: AgentView): AgentPose =>
  poses.read(agent.agentKey) ?? poseOf(agent)

const POSE_FIELDS: ReadonlySet<string> = new Set(['x', 'z', 'heading', 'elevation'])

// Everything but the pose. A fade's progress is motion too: only whether one runs is kept.
export function structuralKey(agents: readonly AgentView[]): string {
  return JSON.stringify(agents, (field: string, value: unknown): unknown =>
    POSE_FIELDS.has(field) ? undefined : field === 'fade' ? true : value
  )
}

// The page's poses: a module store like `officeSettings`, so frame loops read it with no hook.
// A feed writes here unless it is given its own store.
export const officePoses = createPoseStore()

// The agent as it stands now, for readers outside the scene's own frame loop: cards, the
// minimap, citizens' bodies, the camera and the player (perf-2).
export function withLivePose(agent: AgentView): AgentView {
  const pose = officePoses.read(agent.agentKey)
  return pose ? { ...agent, ...pose } : agent
}
