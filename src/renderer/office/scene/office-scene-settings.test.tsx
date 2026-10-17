import { render } from '@testing-library/react'
import { Children, isValidElement, type ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { makeAgent, makeFloor, makeRoom, makeSession } from '../__tests__/fixtures'
import { officeSettings, type OfficeSettingKey } from '../logic/office-settings'
import { createPlayer } from '../player/walking'
import { pinQuality } from '../quality-store'
import { themeForTeam } from '../themes/registry'
import { sceneExtent } from '../themes/surroundings'
import { distributedTown } from '../town/distributed-town'
import { townOf } from '../town/use-town-plan'
import OfficeScene from './OfficeScene'

// Each layer is stood in for by a marker, so what the scene mounts can be read off the page.
// The lights and the background are three.js elements, which the DOM cannot draw.
vi.mock('@react-three/fiber', () => ({
  useFrame: () => undefined,
  Canvas: ({ children }: { children?: ReactNode }) => (
    <div>
      {Children.toArray(children).filter(
        (child) => isValidElement(child) && typeof child.type !== 'string'
      )}
    </div>
  )
}))
vi.mock('./BatchedScene', () => ({
  BatchedScene: ({ children }: { children?: ReactNode }) => <>{children}</>
}))
vi.mock('./Horizon', () => ({ Horizon: () => <i data-layer="ground" /> }))
vi.mock('./FloorView', () => ({ FloorView: () => <i data-layer="floor" /> }))
vi.mock('./BuildingWindows', () => ({ BuildingWindows: () => null }))
vi.mock('./Robot', () => ({
  RobotCrew: ({ agents }: { agents: readonly unknown[] }) => (
    <i data-layer="agents" data-count={agents.length} />
  )
}))
vi.mock('../town/TownGround', () => ({ TownGround: () => <i data-layer="roads" /> }))
vi.mock('../town/TownView', async (original) => ({
  ...(await original<typeof import('../town/TownView')>()),
  TownView: ({ town }: { town: { plan: { lots: readonly unknown[] } } }) => (
    <i data-layer="town" data-lots={town.plan.lots.length} />
  ),
  TownAmbient: ({ share }: { share: number }) => <i data-layer="ambient" data-share={share} />
}))
vi.mock('./ZonePickers', async (original) => ({
  ...(await original<typeof import('./ZonePickers')>()),
  ZonePickers: () => <i data-layer="pickers" />
}))
vi.mock('./CardProjector', () => ({
  CardProjector: () => <i data-layer="cards" />,
  OFFSCREEN: 'translate(-10000px, -10000px)'
}))
vi.mock('./NameCards', () => ({ NameCardLayer: () => null }))
vi.mock('./OfficeNames', () => ({ OfficeNameLayer: () => null, OfficeNameProjector: () => null }))
vi.mock('./WorkstationScreens', () => ({ WorkstationScreens: () => null }))
vi.mock('./CameraRig', () => ({
  CameraRig: ({ scene }: { scene: object }) => (
    <i data-layer="camera" data-scene={JSON.stringify(scene)} />
  )
}))
vi.mock('./RenderLoop', () => ({
  FrameGovernor: () => <i data-layer="governor" />,
  MetricsProbe: () => <i data-layer="metrics" />
}))
vi.mock('../player/PlayerLayer', () => ({
  PlayerLayer: ({ solids, extent }: { solids: readonly unknown[]; extent: object }) => (
    <i data-layer="player" data-solids={solids.length} data-extent={JSON.stringify(extent)} />
  )
}))
vi.mock('../citizens/MoverLayer', () => ({
  MoverLayer: (props: {
    player: unknown
    plan: { lots: readonly unknown[] }
    hasVehicles: boolean
  }) => (
    <i
      data-layer="citizens"
      data-follows-player={Boolean(props.player)}
      data-solids={props.plan.lots.length}
      data-vehicles={props.hasVehicles}
    />
  )
}))

const session = makeSession({ key: 'claude:a' })
const floor = makeFloor({
  floorId: 'f1',
  label: 'Main',
  rooms: [makeRoom({ id: 'r1', sessionKey: session.key })]
})
const agents = [makeAgent({ agentKey: session.key })]
// One list for every render, as the feed keeps its floors while their geometry stands.
const floors = [floor]

beforeEach(() => {
  localStorage.clear()
  officeSettings.reset()
  pinQuality('full')
})

function mount(off: readonly OfficeSettingKey[] = []) {
  for (const key of off) officeSettings.set(key, false)
  const { container } = render(
    <OfficeScene
      theme={themeForTeam()}
      floors={[{ floorId: 'f1', label: 'Main', attentionCount: 0 }]}
      sessions={[session]}
      floor={floor}
      visibleFloors={floors}
      allFloors={floors}
      agents={agents}
      cards={[]}
      stacks={[]}
      selectedAgentKey={null}
      wallsMode="cutaway"
      cameraRequest={null}
      metrics={{ fps: 0, frameMs: 0, drawCalls: 0, triangles: 0 }}
      onSelectAgent={vi.fn()}
      onFlyToAgent={vi.fn()}
      onFlyToZone={vi.fn()}
      reviewableKeys={new Set()}
      onReview={vi.fn()}
      speakingAgentKey={null}
      player={createPlayer({ x: 0, z: 0 })}
    />
  )
  const layer = (name: string): HTMLElement | null =>
    container.querySelector(`[data-layer="${name}"]`)
  const layers = (): string[] =>
    [...container.querySelectorAll('[data-layer]')].map(
      (node) => node.getAttribute('data-layer') ?? ''
    )
  return { layer, layers }
}

const TOWN = ['roads', 'town', 'ambient']

it('renders real agents on all three usable storeys in the same canvas', () => {
  const allFloors = [0, 5.5, 11].map((elevation, index) => ({
    ...floor,
    floorId: `building:one:${index + 1}`,
    elevation,
    buildingId: 'building:one',
    floorNumber: index + 1
  }))
  const allAgents = allFloors.map((surface, index) =>
    makeAgent({
      agentKey: `claude:floor-${index}`,
      floorId: surface.floorId,
      ...{ physicalFloorId: surface.floorId, elevation: surface.elevation }
    })
  )
  const { container } = render(
    <OfficeScene
      theme={themeForTeam()}
      floors={allFloors.map((surface) => ({
        floorId: surface.floorId,
        label: surface.label,
        attentionCount: 0
      }))}
      sessions={[]}
      floor={allFloors[0]}
      agents={allAgents}
      visibleFloors={allFloors}
      allFloors={allFloors}
      cards={[]}
      stacks={[]}
      selectedAgentKey={null}
      wallsMode="cutaway"
      cameraRequest={null}
      metrics={{ fps: 0, frameMs: 0, drawCalls: 0, triangles: 0 }}
      onSelectAgent={vi.fn()}
      onFlyToAgent={vi.fn()}
      onFlyToZone={vi.fn()}
      reviewableKeys={new Set()}
      onReview={vi.fn()}
      speakingAgentKey={null}
    />
  )
  expect(container.querySelectorAll('[data-layer="floor"]')).toHaveLength(3)
  const crews = [...container.querySelectorAll('[data-layer="agents"]')]
  expect(crews).toHaveLength(3)
  expect(crews.map((crew) => crew.getAttribute('data-count'))).toEqual(['1', '1', '1'])
  for (const layer of ['camera', 'governor', 'citizens', 'metrics']) {
    expect(container.querySelectorAll(`[data-layer="${layer}"]`)).toHaveLength(1)
  }
})
const ALWAYS = ['ground', 'floor', 'agents', 'pickers', 'cards', 'camera', 'governor', 'metrics']
// The city the scene lays round its one floor.
const { plan } = distributedTown(townOf(floor, null, 'full', 'city'), [floor])

it('mounts the whole living world while every switch is on', () => {
  const { layer, layers } = mount()
  expect(layers().sort()).toEqual([...ALWAYS, ...TOWN, 'citizens', 'player'].sort())
  expect(Number(layer('ambient')?.dataset.share)).toBeGreaterThan(0)
  expect(Number(layer('town')?.dataset.lots)).toBe(plan.lots.length)
})

it('takes the buildings, the roads, the tower and the ambient life out when the town is off', () => {
  const { layer, layers } = mount(['town'])
  for (const name of TOWN) expect(layers()).not.toContain(name)
  // Framed on the floor alone, and walked on it alone: no town is left to make room for.
  expect(JSON.parse(layer('camera')?.dataset.scene ?? '{}')).toMatchObject(sceneExtent(floor, []))
  expect(JSON.parse(layer('player')?.dataset.extent ?? '{}')).toEqual(sceneExtent(floor, []))
  expect(layer('player')?.dataset.solids).toBe('0')
  // Citizens live in the town: with no town there are no homes and no streets, so none are out.
  expect(layers()).not.toContain('citizens')
  expect(layers()).toEqual(expect.arrayContaining([...ALWAYS, 'player']))
})

it('frames the whole town, to its last road, while the town is on', () => {
  const { layer } = mount()
  expect(JSON.parse(layer('camera')?.dataset.scene ?? '{}')).toMatchObject(plan.extent)
  expect(JSON.parse(layer('player')?.dataset.extent ?? '{}')).toEqual(plan.extent)
})

it('closes the town’s lots to the player, and hands the citizens the plan', () => {
  const { layer } = mount()
  expect(layer('player')?.dataset.solids).toBe(String(plan.lots.length))
  expect(layer('citizens')?.dataset.solids).toBe(String(plan.lots.length))
})

it('mounts no ambient mover when ambient motion is off, and keeps the buildings', () => {
  const { layer, layers } = mount(['ambient'])
  expect(layers()).not.toContain('ambient')
  expect(Number(layer('town')?.dataset.lots)).toBeGreaterThan(0)
  expect(layers()).toEqual(expect.arrayContaining(['roads', 'town']))
})

it('does not mount the citizens layer when citizens are off', () => {
  const { layers } = mount(['citizens'])
  expect(layers()).not.toContain('citizens')
  expect(layers()).toEqual(expect.arrayContaining([...ALWAYS, ...TOWN, 'player']))
})

it('does not mount the player when it is off, and the citizens stop minding it', () => {
  const { layer, layers } = mount(['player'])
  expect(layers()).not.toContain('player')
  expect(layer('citizens')?.dataset.followsPlayer).toBe('false')
})

it('leaves the scene alone for the switches it does not draw', () => {
  const { layers } = mount(['vehicles', 'loungeTrips'])
  expect(layers().sort()).toEqual([...ALWAYS, ...TOWN, 'citizens', 'player'].sort())
})

it('is the compact floor with its agents and nothing else when everything is off', () => {
  const { layer, layers } = mount([
    'town',
    'citizens',
    'vehicles',
    'ambient',
    'loungeTrips',
    'player'
  ])
  expect(layers().sort()).toEqual([...ALWAYS].sort())
  expect(layer('agents')?.dataset.count).toBe('1')
  expect(JSON.parse(layer('camera')?.dataset.scene ?? '{}')).toMatchObject(sceneExtent(floor, []))
})

it('follows a switch flipped while the scene is on show', async () => {
  const { layers } = mount()
  const { act } = await import('@testing-library/react')
  act(() => officeSettings.set('citizens', false))
  expect(layers()).not.toContain('citizens')
  act(() => officeSettings.set('citizens', true))
  expect(layers()).toContain('citizens')
})
