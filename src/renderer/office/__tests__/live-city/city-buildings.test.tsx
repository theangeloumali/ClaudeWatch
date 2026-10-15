import { isValidElement, type ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { MultiFloorLayer } from '../../scene/MultiFloorLayer'
import { getTheme } from '../../themes/registry'
import { makeFloor } from '../fixtures'

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => object) => factory(),
  useRef: (current: unknown) => ({ current })
}))

function componentNames(node: ReactNode): string[] {
  if (Array.isArray(node)) return node.flatMap(componentNames)
  if (!isValidElement<{ children?: ReactNode }>(node)) return []
  return [
    typeof node.type === 'function' ? node.type.name : String(node.type),
    ...componentNames(node.props.children)
  ]
}

it('draws one complete physical building shell for its real storeys in City', () => {
  const floors = [0, 1, 2].map((floorNumber) =>
    makeFloor({
      floorId: `building:office:${floorNumber + 1}`,
      buildingId: 'building:office',
      floorNumber: floorNumber + 1,
      elevation: floorNumber * 5.5
    })
  )
  const props = {
    floors,
    agents: [],
    floorTheme: getTheme('corporate-city'),
    groups: new Map(),
    wallsMode: 'up' as const,
    viewMode: 'city' as const,
    focusedFloorId: floors[0].floorId,
    isReducedMotion: true,
    selectedAgentKey: null,
    speakingAgentKey: null,
    onSelect: vi.fn(),
    onFly: vi.fn(),
    onFlyToZone: vi.fn()
  }
  const scene = MultiFloorLayer(props)
  expect(componentNames(scene).filter((name) => name === 'PhysicalBuildingShell')).toHaveLength(1)
})
