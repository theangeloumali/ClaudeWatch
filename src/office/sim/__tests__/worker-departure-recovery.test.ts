import { expect, it } from 'vitest'
import { agentKey } from '../../../shared/office/agent-key'
import {
  bodyFits,
  SUBAGENT_BODY_RADIUS,
  WORKER_BODY_RADIUS,
  type BodyFootprint
} from '../../../shared/office/body-footprints'
import type { AgentView } from '../../../shared/office/types'
import { createAgent, leaveAgent } from '../behaviour'
import { session, subagent } from '../fixtures'
import { buildLayout, type RoomLayout } from '../layout'
import type { Point } from '../path'
import { recoverWorkerRoute } from '../worker-navigation'
import { World } from '../world'
import { FloorRoutes } from '../world-floor-routes'

const STEP_MS = 100
const DEPARTURE_TICKS = 3000
const MAX_STEP_METRES = 0.140001

// dry-new: the standard fixture lacks fractional wall/door seams and a relocated departure floor.
function departureFixture() {
  const lead = {
    ...session('departing-lead'),
    activity: 'thinking' as const,
    subagents: [subagent('child')]
  }
  const peer = { ...session('retained-peer'), activity: 'thinking' as const }
  const base = buildLayout([lead, peer], undefined)
  const template = base.floors[0]
  const company = template?.zones[0]
  const leadTemplate = template?.rooms.find((room) => room.sessionKey === lead.key)
  const peerTemplate = template?.rooms.find((room) => room.sessionKey === peer.key)
  if (!template || !company || !leadTemplate || !peerTemplate)
    throw new Error('Fixture requires two assigned offices')
  const leadRoom = fractionalOffice(leadTemplate, { x: -30.7, z: -97 })
  const peerRoom = fractionalOffice(peerTemplate, { x: -38.3, z: -89.4 })
  const teamRoom: RoomLayout = {
    ...leadTemplate,
    id: 'departure:team',
    kind: 'team',
    sessionKey: null,
    x: -38,
    z: -96.7,
    width: 4.6,
    depth: 4.6,
    door: { x: -38, z: -99 },
    slots: [
      { id: 'door', x: -38, z: -99, heading: 0 },
      { id: 'team_seat_0', x: -38.3, z: -96.4, heading: 0 }
    ],
    children: []
  }
  const rooms = [leadRoom, peerRoom, teamRoom]
  const entrance = { id: 'entrance', x: -34.5, z: -103, heading: 0 }
  const { lounge: _lounge, ...shell } = company
  const floor = {
    ...template,
    id: 'building:departure:ground',
    buildingId: 'building:departure',
    elevation: 0,
    x: -34.5,
    z: -94.45,
    width: 14.6,
    depth: 17.1,
    entrance,
    elevator: { id: 'connector', x: -39.8, z: -101, heading: 0 },
    rooms,
    zones: [
      {
        ...shell,
        x: -34.5,
        z: -94.45,
        width: 14.6,
        depth: 17.1,
        door: entrance,
        children: rooms
      }
    ]
  }
  const relocatedPeer = fractionalOffice(peerTemplate, { x: 32, z: -90 })
  const relocatedEntrance = { ...entrance, x: 34.5 }
  const relocated = {
    ...floor,
    x: 34.5,
    z: -94.75,
    width: 12,
    depth: 16.5,
    entrance: relocatedEntrance,
    elevator: { ...floor.elevator, x: 30.5 },
    rooms: [relocatedPeer],
    zones: [
      {
        ...shell,
        x: 34.5,
        z: -94.75,
        width: 12,
        depth: 16.5,
        door: relocatedEntrance,
        children: [relocatedPeer]
      }
    ]
  }
  return { base, floor, relocated, lead, peer, leadRoom }
}

function fractionalOffice(template: RoomLayout, center: Point): RoomLayout {
  const door = { x: center.x, z: center.z - 2 }
  return {
    ...template,
    ...center,
    width: 4,
    depth: 4,
    door,
    children: [],
    slots: [
      { ...door, id: 'door', heading: 0 },
      { id: 'desk_main', x: center.x, z: center.z + 0.3, heading: 0 },
      { id: 'desk_guest_0', x: center.x - 1.25, z: center.z - 0.95, heading: 0 },
      { id: 'desk_guest_1', x: center.x + 1.25, z: center.z - 0.95, heading: 0 }
    ]
  }
}

function workerBody(view: AgentView): BodyFootprint {
  return {
    id: view.agentKey,
    x: view.x,
    z: view.z,
    elevation: view.elevation,
    radius: view.isSubagent ? SUBAGENT_BODY_RADIUS : WORKER_BODY_RADIUS
  }
}

it.each(['street', 'connector'] as const)(
  'recovers only the indoor leg and preserves the unchanged %s transition tail',
  (transition) => {
    const { base, floor: ground, lead, leadRoom } = departureFixture()
    const floor =
      transition === 'connector'
        ? { ...ground, id: 'building:departure:upper', elevation: 5.5 }
        : ground
    const routes = new FloorRoutes()
    routes.update({ ...base, floors: transition === 'connector' ? [ground, floor] : [floor] })
    const paths = routes.paths(floor.id)
    const seat = leadRoom.slots.find((slot) => slot.id === 'desk_main')
    const guest = leadRoom.slots.find((slot) => slot.id === 'desk_guest_0')
    if (!paths || !seat || !guest) throw new Error('Fixture requires floor paths and seats')
    const seated = createAgent(
      lead,
      {
        ...seat,
        slotId: seat.id,
        roomId: leadRoom.id,
        floorId: floor.id,
        physicalFloorId: floor.id,
        elevation: floor.elevation
      },
      []
    )
    const agent = leaveAgent(seated, routes.toGround(seated.view, floor, leadRoom.door))
    const originalPath = structuredClone(agent.path)
    const transitionIndex = agent.path.findIndex(
      (point) => point.connectorId !== undefined || !paths.contains(point)
    )
    expect(transitionIndex).toBeGreaterThan(0)
    const seam = agent.path[transitionIndex - 1]
    const tail = agent.path.slice(transitionIndex)
    const terminal = agent.path.at(-1)
    if (!seam || !terminal) throw new Error('Fixture requires an indoor leg and street exit')
    expect(paths.contains(terminal)).toBe(false)
    const body = workerBody(agent.view)
    const obstacles = [
      {
        ...guest,
        id: agentKey(lead.key, 'child'),
        radius: SUBAGENT_BODY_RADIUS,
        elevation: floor.elevation
      }
    ]
    expect(paths.around({ body, to: seam, obstacles }).length).toBeGreaterThan(0)

    const recovered = recoverWorkerRoute({ agent, routes, paths, body, obstacles })

    expect(recovered.length).toBeGreaterThan(tail.length)
    expect(recovered.slice(-tail.length)).toEqual(tail)
    const indoor = recovered.slice(0, -tail.length)
    expect(indoor.at(-1)).toEqual(seam)
    for (const point of indoor) {
      expect(paths.contains(point)).toBe(true)
      expect(paths.isOpen(point)).toBe(true)
      expect(point).toMatchObject({ elevation: floor.elevation, physicalFloorId: floor.id })
      expect(bodyFits({ ...body, ...point }, obstacles)).toBe(true)
    }
    expect(agent.path).toEqual(originalPath)
  }
)

it('retains the terminal-only cross-floor caller contract', () => {
  const { base, floor, lead, leadRoom } = departureFixture()
  const upper = { ...floor, id: 'building:departure:upper', elevation: 5.5 }
  const routes = new FloorRoutes()
  routes.update({ ...base, floors: [floor, upper] })
  const seat = leadRoom.slots.find((slot) => slot.id === 'desk_main')
  if (!seat) throw new Error('Fixture requires a lead seat')
  const target = { x: seat.x, z: seat.z, elevation: 5.5, physicalFloorId: upper.id }
  const agent = createAgent(
    lead,
    {
      ...seat,
      slotId: seat.id,
      roomId: leadRoom.id,
      floorId: floor.id,
      physicalFloorId: floor.id,
      elevation: 0
    },
    []
  )
  const recovered = recoverWorkerRoute({
    agent: { ...agent, path: [target] },
    routes,
    paths: routes.paths(floor.id),
    body: workerBody(agent.view),
    obstacles: []
  })
  expect(recovered.at(-1)).toEqual(target)
  expect(
    recovered.some((point) => point.connectorId === floor.buildingId && point.elevation === 5.5)
  ).toBe(true)
})

it.each([false, true])(
  'clears crowded parent/child departures on fractional geometry (relocated: %s)',
  (hasRelocation) => {
    const { base, floor, relocated, lead, peer } = departureFixture()
    let activeFloor = floor
    const world = new World({
      loungeTrips: false,
      resolveLayout: () => ({ ...base, floors: [activeFloor] })
    })
    world.apply({
      type: 'hello',
      v: 1,
      snapshot: { rev: 1, generatedAtMs: 0, sessions: [lead, peer], sources: [] }
    })
    const departingKeys = [lead.key, agentKey(lead.key, 'child')]
    expect(
      world
        .step(STEP_MS)
        .map((view) => view.agentKey)
        .sort()
    ).toEqual([...departingKeys, peer.key].sort())
    world.apply({ type: 'patch', v: 1, seq: 2, removed: [lead.key], upserts: [] })
    expect(world.step(0).filter((view) => departingKeys.includes(view.agentKey))).toHaveLength(2)
    if (hasRelocation) {
      const before = world.step(STEP_MS).filter((view) => departingKeys.includes(view.agentKey))
      activeFloor = relocated
      world.apply({ type: 'patch', v: 1, seq: 3, removed: [], upserts: [peer] })
      expect(world.step(0).filter((view) => departingKeys.includes(view.agentKey))).toEqual(before)
      expect(world.layout().floors[0].x).toBe(relocated.x)
    }
    let previous = world.step(0)
    const streetWalkers = new Set<string>()
    for (let tick = 0; tick < DEPARTURE_TICKS; tick++) {
      const current = world.step(STEP_MS)
      const bodies = current.map(workerBody)
      for (const body of bodies) expect(bodyFits(body, bodies)).toBe(true)
      const departing = current.filter((candidate) => departingKeys.includes(candidate.agentKey))
      for (const view of departing) {
        const prior = previous.find((candidate) => candidate.agentKey === view.agentKey)
        if (!prior) throw new Error('A departing worker reappeared')
        expect(Math.hypot(view.x - prior.x, view.z - prior.z)).toBeLessThanOrEqual(MAX_STEP_METRES)
        if (view.physicalFloorId === null) streetWalkers.add(view.agentKey)
      }
      previous = current
      if (current.every((view) => !departingKeys.includes(view.agentKey))) break
    }
    expect([...streetWalkers].sort()).toEqual([...departingKeys].sort())
    expect(previous.map((view) => view.agentKey)).toEqual([peer.key])
    const peerSeat = activeFloor.rooms
      .find((room) => room.sessionKey === peer.key)
      ?.slots.find((slot) => slot.id === 'desk_main')
    if (!peerSeat) throw new Error('Fixture requires the retained peer seat')
    expect(previous[0]).toMatchObject({
      physicalFloorId: activeFloor.id,
      activity: 'thinking',
      x: peerSeat.x,
      z: peerSeat.z
    })
  },
  15_000
)
