import { isValidElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { makeAgent, makeFloor } from '../fixtures'
import { floorElevation, floorEnvelope, partitionPhysicalAgents } from '../../scene/all-floor-model'
import { windowParts } from '../../scene/building-window-parts'
import { FloorView } from '../../scene/FloorView'
import { themeForTeam } from '../../themes/registry'

const floors = [0, 5.5, 11].map((elevation, index) => ({
  ...makeFloor({ floorId: `building:a:${index}`, x: 40, z: -30 }),
  buildingId: 'building:a',
  floorNumber: index + 1,
  elevation,
  connector: { x: 35, z: -30 }
}))

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory()
}))

describe('physical storeys', () => {
  it('routes by physical presence, not the home assignment, once per actor', () => {
    const first = makeAgent({ agentKey: 'claude:a', floorId: floors[0].floorId })
    const visiting = { ...first, physicalFloorId: floors[2].floorId, elevation: 11 }
    const transit = { ...first, agentKey: 'claude:b', physicalFloorId: null, elevation: 3 }
    const outside = { ...first, agentKey: 'claude:c', physicalFloorId: 'another-building' }
    const result = partitionPhysicalAgents(floors, [visiting, transit, outside, visiting])
    expect(result.byFloor.get(floors[0].floorId)).toEqual([])
    expect(result.byFloor.get(floors[2].floorId)).toEqual([visiting])
    expect(result.transit).toEqual([transit, outside])
  })

  it('keeps the complete physical envelope and rejects nonfinite elevation', () => {
    expect(floorEnvelope(floors)).toEqual({
      x: 40,
      z: -30,
      width: 20,
      depth: 16,
      minY: 0,
      maxY: 16.5
    })
    expect(floorElevation({ ...floors[0], elevation: Number.NaN })).toBe(0)
    expect(floorEnvelope([])).toBeNull()
  })

  it('keeps the legacy geometry component callable without any elevation contract', () => {
    const element = FloorView({
      floor: makeFloor({ floorId: 'legacy' }),
      floorTheme: themeForTeam(),
      zoneGroups: [],
      wallsMode: 'cutaway',
      isReducedMotion: true
    })
    expect(isValidElement<{ position: number[] }>(element) && element.props.position).toEqual([
      0, 0, 0
    ])
  })

  it('raises the entire physical room geometry exactly once', () => {
    const element = FloorView({
      floor: floors[2],
      floorTheme: themeForTeam(),
      zoneGroups: [],
      wallsMode: 'cutaway',
      isReducedMotion: true
    })
    expect(isValidElement<{ position: number[] }>(element) && element.props.position).toEqual([
      0, 11, 0
    ])
  })

  it.each([20, 40, 60])('renders %i actual workers once across mixed storeys', (count) => {
    const agents = Array.from({ length: count }, (_, index) => ({
      ...makeAgent({ agentKey: `claude:${index}`, floorId: floors[0].floorId }),
      physicalFloorId: floors[index % 3].floorId,
      elevation: floors[index % 3].elevation
    }))
    const crews = partitionPhysicalAgents(floors, agents)
    expect([...crews.byFloor.values()].flat()).toHaveLength(count)
    expect(crews.transit).toHaveLength(0)
    expect(new Set([...crews.byFloor.values()].flat().map((agent) => agent.agentKey)).size).toBe(
      count
    )
  })
})

describe('bounded perimeter glazing', () => {
  it.each([1, 2, 3])('uses unit boxes and at most three batch families for %i storeys', (count) => {
    const parts = floors.slice(0, count).flatMap((floor) => windowParts(floor))
    expect(
      parts.every((part) => part.size.every((size) => size > 0 && Number.isFinite(size)))
    ).toBe(true)
    expect(new Set(parts.map((part) => part.kind)).size).toBeLessThanOrEqual(3)
    expect(parts.length * 12).toBeLessThan(10000)
    expect(new Set(parts.map((part) => part.side))).toEqual(
      new Set(['north', 'east', 'south', 'west', 'connector'])
    )
  })

  it('places windows and connector pillars at the supplied storey, not an exploded copy', () => {
    const parts = windowParts(floors[2])
    const panes = parts.filter((part) => part.kind === 'glass')
    expect(panes.every((part) => part.position[1] > 11 && part.position[1] < 16.5)).toBe(true)
    expect(
      parts
        .filter((part) => part.side === 'connector')
        .every((part) => Math.abs(part.position[0] - 35) < 1)
    ).toBe(true)
  })
})
