import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Minimap } from '../../hud/Minimap'
import { MinimapSurface } from '../../hud/MinimapSurface'
import { buildMinimapModel, type MinimapInput } from '../../logic/minimap-model'
import { distributedTown } from '../../town/distributed-town'
import { railwayPlan, shownRailway } from '../../town/railway-plan'
import { townOf } from '../../town/use-town-plan'
import { makeMinimapFrame, NORTH_FLOOR_ID } from './minimap-fixtures'

const frame = makeMinimapFrame()
const ground = frame.floors.filter((floor) => (floor.elevation ?? 0) === 0)
const plan = distributedTown(townOf(ground[0], null), ground).plan

const modelIn = (viewMode: MinimapInput['viewMode']) =>
  buildMinimapModel({
    frame,
    viewMode,
    focusedFloorId: NORTH_FLOOR_ID,
    focusedRoomId: null,
    selectedAgentKey: null,
    isPreview: false
  })

afterEach(() => shownRailway.set(null))

describe('minimap railway', () => {
  it('the city mini-map frames the ring', () => {
    const railway = railwayPlan(plan)
    if (!railway) throw new Error('no railway')
    shownRailway.set(railway)
    const { bounds, railway: drawn } = modelIn('city')
    if (!bounds || !drawn) throw new Error('no ring on the map')
    expect(drawn.ring).toEqual(railway.centre.points)
    expect(drawn.stations).toHaveLength(4)
    for (const point of [...drawn.ring, ...drawn.stations]) {
      expect(point.x).toBeGreaterThanOrEqual(bounds.minX)
      expect(point.x).toBeLessThanOrEqual(bounds.maxX)
      expect(point.z).toBeGreaterThanOrEqual(bounds.minZ)
      expect(point.z).toBeLessThanOrEqual(bounds.maxZ)
    }
  })

  it('office view does not draw it', () => {
    const before = modelIn('office')
    const railway = railwayPlan(plan)
    if (!railway) throw new Error('no railway')
    shownRailway.set(railway)
    const office = modelIn('office')
    expect(office.railway).toBeNull()
    expect(office.bounds).toEqual(before.bounds)
  })

  it('hides the railway from assistive tech and adds no target', () => {
    const railway = railwayPlan(plan)
    if (!railway) throw new Error('no railway')
    const callbacks = { onChooseFloor: vi.fn(), onChooseRoom: vi.fn(), onChooseWorker: vi.fn() }
    const bare = render(
      <MinimapSurface model={modelIn('city')} viewMode="city" descriptionId="d" {...callbacks} />
    )
    const buttons = bare.container.querySelectorAll('button').length
    bare.unmount()
    shownRailway.set(railway)
    const { container } = render(
      <MinimapSurface model={modelIn('city')} viewMode="city" descriptionId="d" {...callbacks} />
    )
    const group = container.querySelector('[data-railway]')
    expect(group?.getAttribute('aria-hidden')).toBe('true')
    expect(group?.querySelectorAll('circle')).toHaveLength(4)
    expect(container.querySelectorAll('button')).toHaveLength(buttons)
  })

  // The scene publishes the ring after the map first renders; the map must not wait for a tick.
  it('the mini-map draws the ring the moment the scene shows it', () => {
    const railway = railwayPlan(plan)
    if (!railway) throw new Error('no railway')
    const { container } = render(
      <Minimap
        frame={frame}
        viewMode="city"
        focusedFloorId={NORTH_FLOOR_ID}
        focusedRoomId={null}
        selectedAgentKey={null}
        isNarrow={false}
        isPreview={false}
        onChooseFloor={vi.fn()}
        onChooseRoom={vi.fn()}
        onChooseWorker={vi.fn()}
      />
    )
    expect(container.querySelector('[data-railway]')).toBeNull()
    act(() => shownRailway.set(railway))
    expect(container.querySelector('[data-railway]')).not.toBeNull()
  })
})
