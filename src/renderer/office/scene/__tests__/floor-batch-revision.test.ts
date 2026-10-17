// perf-3: the floor's batches rebuild for what changes their parts, not for a click or a reply.
// perf-11: robots batch apart from the storeys, so roster churn rebuilds only them.
import { describe, expect, it, vi } from 'vitest'
import type { AgentView } from '../../../../shared/office/types'
import { makeAgent, makeFloor } from '../../__tests__/fixtures'
import { EMPTY_THEME_ASSIGNMENTS } from '../../logic/office-themes'
import { getTheme } from '../../themes/registry'
import { AUTHORED_WORKER_LIMIT } from '../scene-density'
import { crewBatchRevision } from '../batch-revision'
import { useSceneFloorData } from '../use-scene-floor-data'

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory()
}))
vi.mock('../../logic/office-themes', async (original) => ({
  ...(await original<typeof import('../../logic/office-themes')>()),
  useThemeAssignments: () => EMPTY_THEME_ASSIGNMENTS
}))

const floor = makeFloor({ floorId: 'revision' })
const theme = getTheme('corporate-city')
const crew = (count: number): AgentView[] =>
  Array.from({ length: count }, (_, index) => makeAgent({ agentKey: `claude:${index}` }))
const roamed = (agents: readonly AgentView[]): AgentView[] =>
  agents.map((agent, index) =>
    index === 1 ? { ...agent, roomId: 'r2', physicalFloorId: 'elsewhere' } : agent
  )

function revisionOf(options: {
  agents: readonly AgentView[]
  selectedAgentKey?: string | null
  spireStages?: ReadonlyMap<string, number>
}): string {
  return useSceneFloorData({
    floor,
    visibleFloors: [floor],
    allFloors: [floor],
    theme,
    sessions: [],
    selectedAgentKey: null,
    ...options
  }).revision
}

function crewRevisionOf(agents: readonly AgentView[], selectedAgentKey: string | null = null) {
  return crewBatchRevision({ agents, selectedAgentKey, themeId: theme.id, zoneGroups: [] })
}

describe('floor batch revision', () => {
  it('selecting an agent does not rebuild the batches', () => {
    const agents = crew(3)
    const idle = revisionOf({ agents })
    expect(revisionOf({ agents, selectedAgentKey: 'claude:1' })).toBe(idle)
  })

  // The selected worker's model swap is the crew batch's (below), not the storeys'.
  it('a selection in overview leaves the floor batch alone', () => {
    const agents = crew(AUTHORED_WORKER_LIMIT + 1)
    expect(revisionOf({ agents, selectedAgentKey: 'claude:1' })).toBe(revisionOf({ agents }))
  })

  it('a robot changing room or storey leaves the floor batch alone', () => {
    const agents = crew(3)
    expect(revisionOf({ agents: roamed(agents) })).toBe(revisionOf({ agents }))
  })

  it('a worker joining or leaving leaves the floor batch alone', () => {
    expect(revisionOf({ agents: crew(4) })).toBe(revisionOf({ agents: crew(3) }))
  })

  // A spire's modules live in the shell's batch, so a new stage has to rebuild it.
  it('a spire reaching a new stage rebuilds the floor batch', () => {
    const agents = crew(3)
    expect(revisionOf({ agents, spireStages: new Map([['tower', 2]]) })).not.toBe(
      revisionOf({ agents, spireStages: new Map([['tower', 1]]) })
    )
    expect(revisionOf({ agents, spireStages: new Map() })).toBe(revisionOf({ agents }))
  })

  it('entering overview rebuilds the floor batch, which drops detail', () => {
    expect(revisionOf({ agents: crew(AUTHORED_WORKER_LIMIT + 1) })).not.toBe(
      revisionOf({ agents: crew(AUTHORED_WORKER_LIMIT) })
    )
  })
})

describe('crew batch revision', () => {
  it('rebuilds when a robot changes room or storey, because it is re-parented', () => {
    const agents = crew(3)
    expect(crewRevisionOf(roamed(agents))).not.toBe(crewRevisionOf(agents))
  })

  it('rebuilds when a worker joins', () => {
    expect(crewRevisionOf(crew(4))).not.toBe(crewRevisionOf(crew(3)))
  })

  it('stands while robots only walk', () => {
    const agents = crew(3)
    const walked = agents.map((agent) => ({ ...agent, x: agent.x + 2, z: agent.z - 1 }))
    expect(crewRevisionOf(walked)).toBe(crewRevisionOf(agents))
  })

  it('rebuilds on a selection in overview, where the selected worker swaps its model', () => {
    const agents = crew(AUTHORED_WORKER_LIMIT + 1)
    expect(crewRevisionOf(agents, 'claude:1')).not.toBe(crewRevisionOf(agents))
  })

  it('a selection outside overview does not rebuild the crew', () => {
    const agents = crew(3)
    expect(crewRevisionOf(agents, 'claude:1')).toBe(crewRevisionOf(agents))
  })
})
