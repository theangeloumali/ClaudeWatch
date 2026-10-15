import { isValidElement, type ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { Robot, RobotCrew } from './Robot'
import { FloorView } from './FloorView'
import { groupZonesByTheme } from '../logic/office-themes'
import { getTheme, registerTheme, themeForTeam } from '../themes/registry'
import { makeAgent, makeFloor, makeRoom, makeZone } from '../__tests__/fixtures'
import type { RobotModelProps } from '../themes/types'
import type { LoungeGeometry } from '../scene-model'

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => object) => factory(),
  useLayoutEffect: () => undefined,
  useRef: () => ({ current: null })
}))
vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined }))
vi.mock('./textures', () => ({ blobShadowTexture: () => null, signTexture: () => null }))

function elements(node: ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}

it('delegates the live Robot model to the theme with provider skin and articulation refs', () => {
  const Model = vi.fn((_props: RobotModelProps) => null)
  const theme = { ...themeForTeam(), robot: { ...themeForTeam().robot, Model } }
  const agent = makeAgent({ agentKey: 'a', provider: 'codex' })
  const nodes = elements(
    Robot({
      agent,
      theme,
      rosterIndex: 2,
      isSelected: true,
      isSpeaking: true,
      isReducedMotion: true,
      onSelect: vi.fn(),
      onFly: vi.fn()
    })
  )
  const model = nodes.find((node) => node.type === Model)
  expect(model).toBeDefined()
  if (!model) throw new Error('Missing model')
  if (isValidElement<RobotModelProps>(model)) Model(model.props)
  expect(Model).toHaveBeenCalledWith(
    expect.objectContaining({
      agent,
      skin: theme.robot.skins.codex,
      rosterIndex: 2,
      isReducedMotion: true,
      rig: expect.objectContaining({ head: { current: null }, base: { current: null } })
    })
  )
  expect(nodes.some((node) => node.type === 'capsuleGeometry')).toBe(true)
  expect(nodes.some((node) => node.type === 'ringGeometry')).toBe(true)
})

function makeLounge(companyId: string): LoungeGeometry {
  return {
    id: `${companyId}:lounge`,
    x: 0,
    z: 0,
    width: 6,
    depth: 5,
    door: { x: 0, z: 2.5 },
    seats: [{ slotId: 'lounge_seat_0', x: -1.875, z: -0.5, heading: 0 }]
  }
}

it('renders every floor surface through the theme kit', () => {
  const theme = getTheme('neo-edo-steam')
  const floor = makeFloor({
    floorId: 'p1',
    rooms: [makeRoom({ id: 'r1' })],
    zones: [
      makeZone({
        id: 'c',
        kind: 'company',
        lounge: makeLounge('c'),
        children: [makeZone({ id: 'p', kind: 'project', projectKey: 'p_1' })]
      })
    ]
  })
  const nodes = elements(
    FloorView({
      floor,
      floorTheme: theme,
      zoneGroups: groupZonesByTheme(floor, () => theme.id),
      wallsMode: 'cutaway',
      isReducedMotion: true
    })
  )
  // Ambient is drawn by the town's TownAmbient, outside the floor.
  const { Ambient, ...floorParts } = theme.kit.zone
  expect(Ambient).toBeDefined()
  for (const Component of [...Object.values(theme.kit.floor), ...Object.values(floorParts)]) {
    expect(nodes.some((node) => node.type === Component)).toBe(true)
  }
})

function companyZone(companyKey: string, projectKey: string, roomId: string) {
  return makeZone({
    id: companyKey,
    kind: 'company',
    companyKey,
    children: [
      makeZone({
        id: projectKey,
        kind: 'project',
        companyKey,
        projectKey,
        children: [makeZone({ id: roomId, kind: 'office', companyKey, projectKey })]
      })
    ]
  })
}

const edo = getTheme('neo-edo-steam')
const brass = getTheme('brass-workshop')
const mixedFloor = makeFloor({
  floorId: 'hq',
  rooms: [makeRoom({ id: 'room_a', bay: 1 }), makeRoom({ id: 'room_b', bay: 3 })],
  zones: [companyZone('c_a', 'p_a', 'room_a'), companyZone('c_b', 'p_b', 'room_b')]
})
const mixedGroups = groupZonesByTheme(mixedFloor, (zone) =>
  zone.companyKey === 'c_b' ? brass.id : edo.id
)

it('draws each zone with its own theme, and the slab and lift once with the floor theme', () => {
  const nodes = elements(
    FloorView({
      floor: mixedFloor,
      floorTheme: edo,
      zoneGroups: mixedGroups,
      wallsMode: 'cutaway',
      isReducedMotion: true
    })
  )
  const drawnBy = (component: unknown) => nodes.filter((node) => node.type === component)
  const zoneIds = (component: unknown) =>
    drawnBy(component).map((node) => (node.props.zone as { id: string }).id)
  const roomIds = (component: unknown) =>
    drawnBy(component).flatMap((node) =>
      (node.props.rooms as { id: string }[]).map((room) => room.id)
    )
  expect(zoneIds(edo.kit.zone.CompanyZone)).toEqual(['c_a'])
  expect(zoneIds(brass.kit.zone.CompanyZone)).toEqual(['c_b'])
  expect(zoneIds(edo.kit.zone.ProjectOffice)).toEqual(['p_a'])
  expect(zoneIds(brass.kit.zone.ProjectOffice)).toEqual(['p_b'])
  for (const part of ['Walls', 'RoomFloors'] as const) {
    expect(roomIds(edo.kit.zone[part])).toEqual(['room_a'])
    expect(roomIds(brass.kit.zone[part])).toEqual(['room_b'])
  }
  for (const part of ['Doorway', 'Desk', 'RoomDressing'] as const) {
    expect(drawnBy(edo.kit.zone[part]).map((node) => node.props.room)).toEqual([
      mixedFloor.rooms[0]
    ])
    expect(drawnBy(brass.kit.zone[part]).map((node) => node.props.room)).toEqual([
      mixedFloor.rooms[1]
    ])
  }
  expect(drawnBy(edo.kit.zone.RoomSign).map((node) => node.props.room)).toEqual([
    mixedFloor.rooms[0]
  ])
  expect(drawnBy(brass.kit.zone.RoomSign).map((node) => node.props.room)).toEqual([
    mixedFloor.rooms[1]
  ])
  for (const part of ['Slab', 'Elevator'] as const) {
    expect(drawnBy(edo.kit.floor[part])).toHaveLength(1)
    expect(drawnBy(brass.kit.floor[part])).toHaveLength(0)
  }
})

it("draws a company's lounge with that company's theme, and nothing where there is none", () => {
  const withLounge = (zone: (typeof mixedFloor.zones)[0]) => ({
    ...zone,
    lounge: makeLounge(zone.id)
  })
  const { Lounge, ...zoneWithoutLounge } = brass.kit.zone
  expect(Lounge).toBeDefined()
  const loungeless = {
    ...brass,
    id: 'test-loungeless',
    kit: { ...brass.kit, zone: zoneWithoutLounge }
  }
  registerTheme(loungeless)
  const [edoCompany, brassCompany] = mixedFloor.zones
  const bare = companyZone('c_c', 'p_c', 'room_c')
  const unthemed = companyZone('c_d', 'p_d', 'room_d')
  const floor = {
    ...mixedFloor,
    zones: [withLounge(edoCompany), withLounge(brassCompany), bare, withLounge(unthemed)]
  }
  const themeIds: Record<string, string> = { c_a: edo.id, c_b: brass.id, c_c: edo.id }
  const nodes = elements(
    FloorView({
      floor,
      floorTheme: edo,
      zoneGroups: groupZonesByTheme(
        floor,
        (zone) => themeIds[zone.companyKey ?? ''] ?? loungeless.id
      ),
      wallsMode: 'cutaway',
      isReducedMotion: true
    })
  )
  const loungesBy = (component: unknown) =>
    nodes
      .filter((node) => node.type === component)
      .map((node) => (node.props.lounge as LoungeGeometry).id)
  // c_c has no lounge; c_d has one, but its theme has no Lounge part.
  expect(loungesBy(edo.kit.zone.Lounge)).toEqual(['c_a:lounge'])
  expect(loungesBy(brass.kit.zone.Lounge)).toEqual(['c_b:lounge'])
  expect(nodes.filter((node) => 'lounge' in node.props)).toHaveLength(2)
})

it('gives each robot the theme and roster place of its own room', () => {
  const agents = [
    makeAgent({ agentKey: 'a', roomId: 'room_a' }),
    makeAgent({ agentKey: 'b', roomId: 'room_b' }),
    makeAgent({ agentKey: 'c', roomId: 'not-on-this-floor' })
  ]
  const robots = elements(
    RobotCrew({
      agents,
      zoneGroups: mixedGroups,
      floorTheme: edo,
      selectedAgentKey: 'b',
      speakingAgentKey: null,
      isReducedMotion: true,
      onSelect: vi.fn(),
      onFly: vi.fn()
    })
  ).filter((node) => node.type === Robot)
  expect(
    robots.map((robot) => [
      (robot.props.agent as { agentKey: string }).agentKey,
      (robot.props.theme as { id: string }).id,
      robot.props.rosterIndex,
      robot.props.isSelected
    ])
  ).toEqual([
    ['a', edo.id, 1, false],
    ['b', brass.id, 3, true],
    ['c', edo.id, 0, false]
  ])
})
