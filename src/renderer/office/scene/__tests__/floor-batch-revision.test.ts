// perf-3: the floor's batches rebuild for what changes their parts, not for a click or a reply.
import { describe, expect, it, vi } from 'vitest'
import type { AgentView } from '../../../../shared/office/types'
import { makeAgent, makeFloor } from '../../__tests__/fixtures'
import { EMPTY_THEME_ASSIGNMENTS } from '../../logic/office-themes'
import { getTheme } from '../../themes/registry'
import { AUTHORED_WORKER_LIMIT } from '../scene-density'
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
const crew = (count: number): AgentView[] =>
  Array.from({ length: count }, (_, index) => makeAgent({ agentKey: `claude:${index}` }))

function revisionOf(options: {
  agents: readonly AgentView[]
  selectedAgentKey?: string | null
}): string {
  return useSceneFloorData({
    floor,
    theme: getTheme('corporate-city'),
    sessions: [],
    selectedAgentKey: null,
    ...options
  }).revision
}

describe('floor batch revision', () => {
  it('selecting an agent does not rebuild the batches', () => {
    const agents = crew(3)
    const idle = revisionOf({ agents })
    expect(revisionOf({ agents, selectedAgentKey: 'claude:1' })).toBe(idle)
  })

  it('rebuilds when a robot changes room, because it is re-parented', () => {
    const agents = crew(3)
    const moved = agents.map((agent, index) => (index === 1 ? { ...agent, roomId: 'r2' } : agent))
    expect(revisionOf({ agents: moved })).not.toBe(revisionOf({ agents }))
  })

  it('rebuilds on a selection in overview, where the selected worker swaps its model', () => {
    const agents = crew(AUTHORED_WORKER_LIMIT + 1)
    expect(revisionOf({ agents, selectedAgentKey: 'claude:1' })).not.toBe(revisionOf({ agents }))
  })
})
