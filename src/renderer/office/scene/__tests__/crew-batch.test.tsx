// perf-11: storeys draw their robots in a batch of their own, re-keyed by the roster alone.
import { isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { AgentView } from '../../../../shared/office/types'
import { makeAgent, makeFloor } from '../../__tests__/fixtures'
import { getTheme } from '../../themes/registry'
import { BatchedScene } from '../BatchedScene'
import { FloorView } from '../FloorView'
import { MultiFloorLayer } from '../MultiFloorLayer'
import { PhysicalBuildingShell } from '../PhysicalBuildingShell'
import { RobotCrew } from '../Robot'

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
  useRef: (current: unknown) => ({ current })
}))

const floors = [0, 1].map((index) =>
  makeFloor({
    floorId: `building:office:${index + 1}`,
    buildingId: 'building:office',
    floorNumber: index + 1,
    elevation: index * 5.5
  })
)
const agents = [0, 1, 2].map((index) =>
  makeAgent({
    agentKey: `claude:${index}`,
    floorId: floors[0].floorId,
    physicalFloorId: floors[index % 2].floorId
  })
)

function layer(crew: readonly AgentView[]): ReactNode {
  const props: ComponentProps<typeof MultiFloorLayer> = {
    floors,
    agents: crew,
    floorTheme: getTheme('corporate-city'),
    groups: new Map(),
    wallsMode: 'cutaway',
    viewMode: 'office',
    isReducedMotion: true,
    selectedAgentKey: null,
    speakingAgentKey: null,
    onSelect: vi.fn(),
    onFly: vi.fn(),
    onFlyToZone: vi.fn()
  }
  return MultiFloorLayer(props)
}

// The JSX as written, components unexpanded, so each batch's direct contents can be read.
function elements(node: ReactNode): ReactElement<{ children?: ReactNode; revision?: string }>[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<{ children?: ReactNode }>(node)) return []
  return [node, ...elements(node.props.children)]
}

const crewBatchesOf = (node: ReactNode) =>
  elements(node).filter((element) => element.type === BatchedScene)

describe('storeys crew batch', () => {
  it('holds every crew and nothing of the floors or the buildings', () => {
    const [batch, ...others] = crewBatchesOf(layer(agents))
    expect(others).toHaveLength(0)
    const inside = elements(batch.props.children).map((element) => element.type)
    expect(inside.filter((type) => type === RobotCrew)).toHaveLength(floors.length)
    expect(inside).not.toContain(FloorView)
    expect(inside).not.toContain(PhysicalBuildingShell)
    const outside = elements(layer(agents)).filter((element) => element.type === RobotCrew)
    expect(outside).toHaveLength(floors.length)
  })

  it('is re-keyed when a robot changes room, and not while robots walk', () => {
    const revisionOf = (crew: readonly AgentView[]) => crewBatchesOf(layer(crew))[0].props.revision
    const roamed = agents.map((agent, index) => (index === 0 ? { ...agent, roomId: 'r2' } : agent))
    const walked = agents.map((agent) => ({ ...agent, x: agent.x + 3 }))
    expect(revisionOf(roamed)).not.toBe(revisionOf(agents))
    expect(revisionOf(walked)).toBe(revisionOf(agents))
  })
})
